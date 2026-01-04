/**
 * Encourages canonical math expressions so the printer outputs briefly simplified operations via normalization utilities.
 */
import { Core, type GameMakerAstNode, type MutableGameMakerAstNode } from "@gml-modules/core";
import { createParserTransform } from "./functional-transform.js";
import { cleanupMultiplicativeIdentityParentheses } from "./math/parentheses-cleanup.js";
import {
    applyManualMathNormalization,
    matchDegreesToRadians,
    normalizeTraversalContext,
    applyScalarCondensing,
    simplifyZeroDivisionNumerators,
    replaceNodeWith,
    type ConvertManualMathTransformOptions
} from "./math/traversal-normalization.js";

const { BINARY_EXPRESSION, LITERAL, PARENTHESIZED_EXPRESSION } = Core;

/**
 * Compute a tolerance scaled to a reference value's magnitude. Used to determine
 * when a floating-point number is "close enough" to zero to avoid unsafe division
 * or other arithmetic that would fail with strict equality checks.
 *
 * @param {number} reference Reference value whose magnitude determines scale.
 * @returns {number} Non-negative tolerance value.
 */
function computeNumericTolerance(reference: number): number {
    const scale = Math.max(1, Math.abs(reference));
    // Use a multiplier of 4 to account for cumulative rounding during arithmetic
    return Number.EPSILON * scale * 4;
}

type ParenthesizedExpressionNode = GameMakerAstNode & {
    expression?: GameMakerAstNode | null;
};

type BinaryExpressionNode = GameMakerAstNode & {
    left?: GameMakerAstNode | null;
    operator?: string | null;
    right?: GameMakerAstNode | null;
};

function extractLiteralNumber(literal: GameMakerAstNode): number | null {
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

function unwrapExpression(node: GameMakerAstNode | null | undefined): GameMakerAstNode | null {
    let current = node;
    while (current && current.type === PARENTHESIZED_EXPRESSION) {
        current = (current as ParenthesizedExpressionNode).expression ?? null;
    }

    return current ?? null;
}

function extractReciprocalScalar(node: GameMakerAstNode | null | undefined): number | null {
    const expression = unwrapExpression(node);
    if (!expression || expression.type !== BINARY_EXPRESSION || expression.operator !== "/") {
        return null;
    }

    const binary = expression as BinaryExpressionNode;
    const numerator = unwrapExpression(binary.left);
    const denominator = unwrapExpression(binary.right);

    if (!numerator || !denominator) {
        return null;
    }

    const numeratorValue = extractLiteralNumber(numerator);
    const denominatorValue = extractLiteralNumber(denominator);

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

function getMultiplicationFactor(node: GameMakerAstNode | null | undefined): number | null {
    if (!node || typeof node !== "object") {
        return null;
    }

    const literalValue = extractLiteralNumber(node);
    if (literalValue !== null && Number.isFinite(literalValue)) {
        // Use tolerance-aware comparison to detect values extremely close to zero
        // that might arise from floating-point rounding errors
        const tolerance = computeNumericTolerance(literalValue);
        if (Math.abs(literalValue) <= tolerance) {
            return null;
        }
        return 1 / literalValue;
    }

    const reciprocalScalar = extractReciprocalScalar(node);
    if (reciprocalScalar !== null && Number.isFinite(reciprocalScalar)) {
        // Use tolerance-aware comparison to avoid division by near-zero values
        const tolerance = computeNumericTolerance(reciprocalScalar);
        if (Math.abs(reciprocalScalar) <= tolerance) {
            return null;
        }
        return reciprocalScalar;
    }

    return null;
}

function flattenMultiplicativeOperand(node: MutableGameMakerAstNode) {
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
    if (!innermost || innermost.type !== BINARY_EXPRESSION || innermost.operator !== "*") {
        return;
    }

    if (wrappers.some((wrapper) => Core.hasComment(wrapper)) || Core.hasComment(innermost)) {
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

/**
 * Converts division by a constant literal into multiplication by its reciprocal.
 * Example: `x / 2` -> `x * 0.5`
 */
function attemptConvertDivisionToMultiplication(node: MutableGameMakerAstNode): boolean {
    if (node.type !== BINARY_EXPRESSION || node.operator !== "/") {
        return false;
    }

    if (matchDegreesToRadians(node)) {
        return false;
    }

    const right = node.right;
    const multiplier = getMultiplicationFactor(right);
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

    flattenMultiplicativeOperand(node);

    return true;
}

/**
 * Walk the AST and turn division-by-constant patterns into multiplications by the reciprocal.
 */
function applyDivisionToMultiplication(node: MutableGameMakerAstNode) {
    if (!node || typeof node !== "object") {
        return;
    }

    // Apply transform
    attemptConvertDivisionToMultiplication(node);

    // Recursively descend through the AST to find and transform all division
    // operations. The depth-first traversal ensures child nodes are optimized
    // before their parents, which is critical when a division expression contains
    // nested divisions (e.g., `(x / 2) / 3` should become `x * 0.5 * 0.333...`).
    for (const key in node) {
        // Skip parent references to avoid cycles
        if (key === "parent") continue;

        const child = (node as any)[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                applyDivisionToMultiplication(item);
            }
        } else if (child && typeof child === "object") {
            applyDivisionToMultiplication(child);
        }
    }
}

function execute(ast: MutableGameMakerAstNode, options: ConvertManualMathTransformOptions): MutableGameMakerAstNode {
    // Drive the composed math normalization helpers in the prescribed order.
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, options);

    // Apply division to multiplication optimization
    applyDivisionToMultiplication(ast);

    applyManualMathNormalization(ast, traversalContext);
    applyScalarCondensing(ast, traversalContext);
    simplifyZeroDivisionNumerators(ast, traversalContext);
    cleanupMultiplicativeIdentityParentheses(ast, traversalContext);

    return ast;
}

export const optimizeMathExpressionsTransform = createParserTransform<ConvertManualMathTransformOptions>(
    "optimize-math-expressions",
    {},
    execute
);
