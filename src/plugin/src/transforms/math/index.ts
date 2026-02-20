import type { ConvertManualMathTransformOptions } from "./types.js";

export type { ConvertManualMathTransformOptions } from "./types.js";

/**
 * Builds a traversal context for math normalization passes.
 */
export function normalizeTraversalContext(
    ast: unknown,
    context: ConvertManualMathTransformOptions | null
): ConvertManualMathTransformOptions {
    if (context && typeof context === "object") {
        if (context.astRoot) {
            return context;
        }
        return { ...context, astRoot: ast as never };
    }
    return { astRoot: ast as never };
}

/**
 * Removes redundant parentheses around multiplicative identity expressions.
 */
export function cleanupMultiplicativeIdentityParentheses(
    node: any,
    _context: ConvertManualMathTransformOptions | null,
    _parent: unknown = null
): void {
    if (!node || typeof node !== "object") {
        return;
    }

    if (
        node.type === "ParenthesizedExpression" &&
        node.expression &&
        typeof node.expression === "object" &&
        node.expression.__fromMultiplicativeIdentity === true
    ) {
        const inner = node.expression;
        Object.assign(node, inner);
        node.__fromMultiplicativeIdentity = true;
    }
}

/**
 * Combines numeric scalar factors in a binary multiplication expression.
 */
export function applyScalarCondensing(ast: any, _context: ConvertManualMathTransformOptions | null): void {
    if (!ast || typeof ast !== "object") {
        return;
    }

    if (
        ast.type === "BinaryExpression" &&
        ast.operator === "*" &&
        ast.left?.type === "BinaryExpression" &&
        ast.left.operator === "*" &&
        ast.left.right?.type === "Literal" &&
        ast.right?.type === "Literal"
    ) {
        const leftVal = Number.parseFloat(ast.left.right.value);
        const rightVal = Number.parseFloat(ast.right.value);
        if (!Number.isNaN(leftVal) && !Number.isNaN(rightVal)) {
            ast.type = ast.left.type;
            ast.operator = ast.left.operator;
            ast.right = { type: "Literal", value: String(leftVal * rightVal) };
            ast.left = ast.left.left;
        }
    }
}

/**
 * Removes multiplicative identity operands (× 1 or 1 ×) from binary expressions.
 */
export function applyManualMathNormalization(ast: any, _context: ConvertManualMathTransformOptions | null): void {
    if (!ast || typeof ast !== "object") {
        return;
    }

    if (ast.type === "BinaryExpression" && ast.operator === "*") {
        const leftIsOne = ast.left?.type === "Literal" && ast.left.value === "1";
        const rightIsOne = ast.right?.type === "Literal" && ast.right.value === "1";

        if (leftIsOne) {
            const replacement = ast.right;
            Object.assign(ast, replacement);
            ast.__fromMultiplicativeIdentity = true;
        } else if (rightIsOne) {
            const replacement = ast.left;
            Object.assign(ast, replacement);
            ast.__fromMultiplicativeIdentity = true;
        }
    }
}
