/**
 * Math expression normalization transforms for the GML plugin printer.
 *
 * Provides AST reshaping utilities to normalize operator nesting, simplify
 * scalar products, and clean up redundant parentheses.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

const { isObjectLike } = Core;

export type MathTraversalContext = {
    astRoot: MutableGameMakerAstNode | null;
    sourceText?: string;
    originalText?: string;
};

/**
 * Builds a normalized traversal context, ensuring astRoot is always populated.
 */
export function normalizeTraversalContext(
    ast: MutableGameMakerAstNode | null,
    context: Partial<MathTraversalContext> | null
): MathTraversalContext {
    if (context !== null && typeof context === "object") {
        if (context.astRoot !== null && context.astRoot !== undefined && typeof context.astRoot === "object") {
            return context as MathTraversalContext;
        }

        return { ...context, astRoot: ast };
    }

    return { astRoot: ast };
}

function parseNumericLiteralValue(node: unknown): number | null {
    if (!isObjectLike(node) || Array.isArray(node)) {
        return null;
    }

    const record = node as Record<string, unknown>;

    if (record.type !== "Literal") {
        return null;
    }

    const raw = record.value;
    if (typeof raw !== "string") {
        return null;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

function replaceNodeInPlace(target: Record<string, unknown>, source: Record<string, unknown>): boolean {
    if (!isObjectLike(target) || !isObjectLike(source)) {
        return false;
    }

    for (const key of Object.keys(target)) {
        if (key !== "parent") {
            delete target[key];
        }
    }

    for (const [key, value] of Object.entries(source)) {
        if (key !== "parent") {
            target[key] = value;
        }
    }

    return true;
}

/**
 * Condenses adjacent numeric scalar factors in a chain of multiplications.
 * For example, `foo * 2 * 3` becomes `foo * 6`.
 */
export function applyScalarCondensing(
    ast: MutableGameMakerAstNode | null,
    _context: MathTraversalContext | null
): MutableGameMakerAstNode | null {
    if (!isObjectLike(ast)) {
        return ast;
    }

    traverseAndCondense(ast as Record<string, unknown>);

    return ast;
}

function traverseAndCondense(node: Record<string, unknown>): void {
    if (!isObjectLike(node) || Array.isArray(node)) {
        return;
    }

    // Post-order: recurse into children first
    for (const value of Object.values(node)) {
        if (isObjectLike(value) && !Array.isArray(value)) {
            traverseAndCondense(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (isObjectLike(item)) {
                    traverseAndCondense(item as Record<string, unknown>);
                }
            }
        }
    }

    // Attempt to condense this node if it is a multiplicative binary expression
    if (node.type !== "BinaryExpression" || node.operator !== "*") {
        return;
    }

    const left = node.left as Record<string, unknown>;
    const right = node.right as Record<string, unknown>;

    if (!isObjectLike(left) || !isObjectLike(right)) {
        return;
    }

    // Case: (non-literal * literal) * literal => non-literal * (product)
    if (left.type === "BinaryExpression" && left.operator === "*" && isObjectLike(left.right)) {
        const innerRight = left.right as Record<string, unknown>;
        const leftScalar = parseNumericLiteralValue(innerRight);
        const rightScalar = parseNumericLiteralValue(right);

        if (leftScalar !== null && rightScalar !== null) {
            const product = leftScalar * rightScalar;
            // Hoist inner left up to be the new left child
            const innerLeft = left.left;
            node.left = innerLeft;
            // Replace right with the condensed literal
            (right).value = String(product);
            return;
        }
    }

    // Case: literal * (literal * non-literal) => (product) * non-literal
    if (right.type === "BinaryExpression" && right.operator === "*" && isObjectLike(right.left)) {
        const innerLeft = right.left as Record<string, unknown>;
        const leftScalar = parseNumericLiteralValue(left);
        const rightLeftScalar = parseNumericLiteralValue(innerLeft);

        if (leftScalar !== null && rightLeftScalar !== null) {
            const product = leftScalar * rightLeftScalar;
            (left).value = String(product);
            node.right = right.right;
        }
    }
}

/**
 * Removes multiplicative identity operands (multiplying by 1) from the AST.
 * Marks replaced nodes with `__fromMultiplicativeIdentity: true`.
 */
export function applyManualMathNormalization(
    ast: MutableGameMakerAstNode | null,
    _context: MathTraversalContext | null
): MutableGameMakerAstNode | null {
    if (!isObjectLike(ast)) {
        return ast;
    }

    traverseAndRemoveIdentities(ast as Record<string, unknown>);

    return ast;
}

function traverseAndRemoveIdentities(node: Record<string, unknown>): void {
    if (!isObjectLike(node) || Array.isArray(node)) {
        return;
    }

    // Post-order: recurse first
    for (const value of Object.values(node)) {
        if (isObjectLike(value) && !Array.isArray(value)) {
            traverseAndRemoveIdentities(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (isObjectLike(item)) {
                    traverseAndRemoveIdentities(item as Record<string, unknown>);
                }
            }
        }
    }

    if (node.type !== "BinaryExpression" || node.operator !== "*") {
        return;
    }

    const left = node.left as Record<string, unknown>;
    const right = node.right as Record<string, unknown>;

    if (!isObjectLike(left) || !isObjectLike(right)) {
        return;
    }

    const leftVal = parseNumericLiteralValue(left);
    const rightVal = parseNumericLiteralValue(right);

    if (leftVal !== null && Math.abs(leftVal - 1) < 1e-9) {
        // Replace node with right operand
        replaceNodeInPlace(node, right);
        node.__fromMultiplicativeIdentity = true;
        return;
    }

    if (rightVal !== null && Math.abs(rightVal - 1) < 1e-9) {
        // Replace node with left operand
        replaceNodeInPlace(node, left);
        node.__fromMultiplicativeIdentity = true;
    }
}

/**
 * Removes redundant parentheses around multiplicative identity replacements
 * when the replacement is safe to unwrap.
 */
export function cleanupMultiplicativeIdentityParentheses(
    node: Record<string, unknown>,
    _context: MathTraversalContext | null,
    _parent: Record<string, unknown> | null
): void {
    if (!isObjectLike(node)) {
        return;
    }

    if (node._gmlManualMathOriginal === true) {
        return;
    }

    if (Array.isArray(node)) {
        for (const element of node) {
            cleanupMultiplicativeIdentityParentheses(element, _context, node);
        }
        return;
    }

    if (
        node.type === "ParenthesizedExpression" &&
        isObjectLike(node.expression) &&
        (node.expression as Record<string, unknown>).__fromMultiplicativeIdentity === true
    ) {
        const inner = node.expression as Record<string, unknown>;
        replaceNodeInPlace(node, inner);
        node.__fromMultiplicativeIdentity = true;
        return;
    }

    for (const value of Object.values(node)) {
        if (!isObjectLike(value)) {
            continue;
        }

        if (Array.isArray(value)) {
            for (const element of value) {
                if (isObjectLike(element)) {
                    cleanupMultiplicativeIdentityParentheses(element as Record<string, unknown>, _context, node);
                }
            }
        } else {
            cleanupMultiplicativeIdentityParentheses(value as Record<string, unknown>, _context, node);
        }
    }
}
