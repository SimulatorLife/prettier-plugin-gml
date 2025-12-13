/**
 * Encourages canonical math expressions so the printer outputs briefly simplified operations via normalization utilities.
 */
import {
    Core,
    type GameMakerAstNode,
    type MutableGameMakerAstNode
} from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    matchDegreesToRadians,
    normalizeTraversalContext,
    applyScalarCondensing,
    replaceNodeWith,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";

const { BINARY_EXPRESSION, LITERAL, PARENTHESIZED_EXPRESSION } = Core;

type ParenthesizedExpressionNode = GameMakerAstNode & {
    expression?: GameMakerAstNode | null;
};

type BinaryExpressionNode = GameMakerAstNode & {
    left?: GameMakerAstNode | null;
    operator?: string | null;
    right?: GameMakerAstNode | null;
};

/**
 * Transform that composes the various manual math optimizations into the parser transform pipeline.
 */
export class OptimizeMathExpressionsTransform extends FunctionalParserTransform<ConvertManualMathTransformOptions> {
    constructor() {
        super("optimize-math-expressions", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: ConvertManualMathTransformOptions
    ): MutableGameMakerAstNode {
        // Drive the composed math normalization helpers in the prescribed order.
        if (!ast || typeof ast !== "object") {
            return ast;
        }

        const traversalContext = normalizeTraversalContext(ast, options);

        // Apply division to multiplication optimization
        this.applyDivisionToMultiplication(ast);

        applyManualMathNormalization(ast, traversalContext);
        applyScalarCondensing(ast, traversalContext);
        cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

        return ast;
    }

    /**
     * Walk the AST and turn division-by-constant patterns into multiplications by the reciprocal.
     */
    private applyDivisionToMultiplication(node: MutableGameMakerAstNode) {
        if (!node || typeof node !== "object") {
            return;
        }

        // Apply transform
        this.attemptConvertDivisionToMultiplication(node);

        // Recurse
        for (const key in node) {
            // Skip parent references to avoid cycles
            if (key === "parent") continue;

            const child = (node as any)[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    this.applyDivisionToMultiplication(item);
                }
            } else if (child && typeof child === "object") {
                this.applyDivisionToMultiplication(child);
            }
        }
    }

    /**
     * Converts division by a constant literal into multiplication by its reciprocal.
     * Example: `x / 2` -> `x * 0.5`
     */
    private attemptConvertDivisionToMultiplication(
        node: MutableGameMakerAstNode
    ): boolean {
        if (node.type !== BINARY_EXPRESSION || node.operator !== "/") {
            return false;
        }

        if (matchDegreesToRadians(node)) {
            return false;
        }

        const right = node.right;
        const multiplier = this.getMultiplicationFactor(right);
        if (multiplier === null) {
            return false;
        }

        // Mutate the node
        node.operator = "*";
        const replacementLiteral = {
            type: LITERAL,
            value: String(multiplier),
            raw: String(multiplier)
        } as MutableGameMakerAstNode;
        Core.assignClonedLocation(replacementLiteral, right);
        node.right = replacementLiteral;

        this.flattenMultiplicativeOperand(node);

        return true;
    }

    private flattenMultiplicativeOperand(node: MutableGameMakerAstNode) {
        const leftOperand = node.left as ParenthesizedExpressionNode | null;
        if (!leftOperand || leftOperand.type !== PARENTHESIZED_EXPRESSION) {
            return;
        }

        const wrappers: ParenthesizedExpressionNode[] = [];
        let cursor = leftOperand;

        while (cursor && cursor.type === PARENTHESIZED_EXPRESSION) {
            wrappers.push(cursor);

            const nested = cursor.expression;
            if (!nested || nested.type !== PARENTHESIZED_EXPRESSION) {
                break;
            }

            cursor = nested;
        }

        if (wrappers.length === 0 || !cursor) {
            return;
        }

        const innermost = cursor.expression;
        if (
            !innermost ||
            innermost.type !== BINARY_EXPRESSION ||
            innermost.operator !== "*"
        ) {
            return;
        }

        if (
            wrappers.some((wrapper) => Core.hasComment(wrapper)) ||
            Core.hasComment(innermost)
        ) {
            return;
        }

        const current = node.left as ParenthesizedExpressionNode | null;
        while (current && current.type === PARENTHESIZED_EXPRESSION) {
            const expression = current.expression;
            if (!expression || !replaceNodeWith(current, expression)) {
                break;
            }
        }
    }

    private getMultiplicationFactor(
        node: GameMakerAstNode | null | undefined
    ): number | null {
        if (!node || typeof node !== "object") {
            return null;
        }

        const literalValue = this.extractLiteralNumber(node);
        if (literalValue !== null && Number.isFinite(literalValue)) {
            if (literalValue === 0) {
                return null;
            }
            return 1 / literalValue;
        }

        const reciprocalScalar = this.extractReciprocalScalar(node);
        if (reciprocalScalar !== null && Number.isFinite(reciprocalScalar)) {
            if (reciprocalScalar === 0) {
                return null;
            }
            return reciprocalScalar;
        }

        return null;
    }

    private extractReciprocalScalar(
        node: GameMakerAstNode | null | undefined
    ): number | null {
        const expression = this.unwrapExpression(node);
        if (
            !expression ||
            expression.type !== BINARY_EXPRESSION ||
            expression.operator !== "/"
        ) {
            return null;
        }

        const binary = expression as BinaryExpressionNode;
        const numerator = this.unwrapExpression(binary.left);
        const denominator = this.unwrapExpression(binary.right);

        if (!numerator || !denominator) {
            return null;
        }

        const numeratorValue = this.extractLiteralNumber(numerator);
        const denominatorValue = this.extractLiteralNumber(denominator);

        if (
            numeratorValue === null ||
            denominatorValue === null ||
            !Number.isFinite(numeratorValue) ||
            !Number.isFinite(denominatorValue)
        ) {
            return null;
        }

        if (Math.abs(numeratorValue - 1) > Number.EPSILON) {
            return null;
        }

        return denominatorValue;
    }

    private unwrapExpression(
        node: GameMakerAstNode | null | undefined
    ): GameMakerAstNode | null {
        let current = node;
        while (current && current.type === PARENTHESIZED_EXPRESSION) {
            current = (current as ParenthesizedExpressionNode).expression ?? null;
        }

        return current ?? null;
    }

    private extractLiteralNumber(
        literal: GameMakerAstNode
    ): number | null {
        const rawValue = literal.value;
        if (typeof rawValue === "number") {
            return rawValue;
        }

        if (typeof rawValue === "string") {
            const numeric = Number(rawValue);
            return Number.isFinite(numeric) ? numeric : null;
        }

        return null;
    }
}

export const optimizeMathExpressionsTransform =
    new OptimizeMathExpressionsTransform();
