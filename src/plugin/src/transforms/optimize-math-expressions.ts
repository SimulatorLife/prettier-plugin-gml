/**
 * Encourages canonical math expressions so the printer outputs briefly simplified operations via normalization utilities.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    normalizeTraversalContext,
    applyScalarCondensing,
    replaceNodeWith,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";

const { BINARY_EXPRESSION, LITERAL, PARENTHESIZED_EXPRESSION } = Core;

type ParenthesizedExpressionNode = MutableGameMakerAstNode & {
    expression?: MutableGameMakerAstNode | null;
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

        const right = node.right;
        // Ensure we are dividing by a numeric literal
        if (right.type !== LITERAL) {
            return false;
        }
        const rawValue = right.value;
        const divisor =
            typeof rawValue === "number"
                ? rawValue
                : typeof rawValue === "string"
                  ? Number(rawValue)
                  : Number.NaN;

        if (!Number.isFinite(divisor) || divisor === 0) {
            return false; // Avoid division by zero issues
        }

        // Calculate reciprocal
        const reciprocal = 1 / divisor;

        // Mutate the node
        node.operator = "*";
        node.right = {
            ...right,
            value: String(reciprocal),
            raw: String(reciprocal)
        };

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
}

export const optimizeMathExpressionsTransform =
    new OptimizeMathExpressionsTransform();
