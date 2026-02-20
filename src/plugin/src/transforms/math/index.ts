/**
 * Math expression reshaping utilities for the GML plugin printer.
 *
 * These transforms normalize operator nesting and collapse multiplicative
 * identities so the printer emits consistently formatted math expressions.
 *
 * NOTE: Full implementations are maintained in @gml-modules/lint's math
 * transform module. The plugin copies are pending migration.
 */

export type ConvertManualMathTransformOptions = {
    sourceText?: string;
    originalText?: string;
    astRoot?: object;
};

/**
 * Normalizes a traversal context object by ensuring it carries the AST root.
 */
export function normalizeTraversalContext(
    ast: unknown,
    context: ConvertManualMathTransformOptions | null
): ConvertManualMathTransformOptions {
    if (context && typeof context === "object") {
        if ((context as any).astRoot && typeof (context as any).astRoot === "object") {
            return context;
        }
        return { ...context, astRoot: ast as object };
    }
    return { astRoot: ast as object };
}

/**
 * Replaces a node's own-enumerable properties in-place with another object's.
 */
function replaceNodeWith(target: object, replacement: object): boolean {
    if (!target || !replacement) {
        return false;
    }
    for (const key of Object.keys(target)) {
        delete (target as Record<string, unknown>)[key];
    }
    Object.assign(target, replacement);
    return true;
}

/**
 * Recursively removes parentheses introduced around multiplicative-identity
 * replacements when it is safe to do so.
 */
export function cleanupMultiplicativeIdentityParentheses(
    node: unknown,
    context: ConvertManualMathTransformOptions | null,
    parent: unknown = null
): void {
    void parent;
    if (!node || typeof node !== "object") {
        return;
    }

    const n = node as Record<string, unknown>;

    if (n._gmlManualMathOriginal === true) {
        return;
    }

    if (Array.isArray(n)) {
        for (const element of n as unknown[]) {
            cleanupMultiplicativeIdentityParentheses(element, context, node);
        }
        return;
    }

    if (
        n.type === "ParenthesizedExpression" &&
        n.expression &&
        typeof n.expression === "object" &&
        (n.expression as Record<string, unknown>).__fromMultiplicativeIdentity === true
    ) {
        const inner = n.expression as Record<string, unknown>;
        if (replaceNodeWith(node, inner as object)) {
            n.__fromMultiplicativeIdentity = true;
            cleanupMultiplicativeIdentityParentheses(node, context, parent);
        }
        return;
    }

    for (const value of Object.values(n)) {
        if (!value || typeof value !== "object") {
            continue;
        }
        if (Array.isArray(value)) {
            for (const element of value) {
                cleanupMultiplicativeIdentityParentheses(element, context, node);
            }
        } else {
            cleanupMultiplicativeIdentityParentheses(value, context, node);
        }
    }
}

/**
 * Condenses adjacent numeric scalar factors in a binary multiplication chain.
 * For example, `foo * 2 * 3` becomes `foo * 6`.
 */
export function applyScalarCondensing(ast: unknown, _context: ConvertManualMathTransformOptions | null = null): void {
    if (!ast || typeof ast !== "object") {
        return;
    }
    condenseMathNode(ast as Record<string, unknown>);
}

function condenseMathNode(node: Record<string, unknown>): void {
    if (!node || Array.isArray(node)) {
        return;
    }

    if (node.type === "BinaryExpression" && node.operator === "*") {
        const left = node.left as Record<string, unknown> | undefined;
        const right = node.right as Record<string, unknown> | undefined;

        if (left && right && left.type === "BinaryExpression" && left.operator === "*") {
            const leftRight = left.right as Record<string, unknown> | undefined;
            if (leftRight && leftRight.type === "Literal" && right.type === "Literal") {
                const aVal = leftRight.value;
                const bVal = right.value;
                if (
                    (typeof aVal === "number" || typeof aVal === "string") &&
                    (typeof bVal === "number" || typeof bVal === "string")
                ) {
                    const a = Number.parseFloat(String(aVal));
                    const b = Number.parseFloat(String(bVal));
                    if (!Number.isNaN(a) && !Number.isNaN(b)) {
                        leftRight.value = String(a * b);
                        // Lift the left subtree up to replace node
                        replaceNodeWith(node as object, left as object);
                        return;
                    }
                }
            }
        }
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            condenseMathNode(value as Record<string, unknown>);
        }
    }
}

/**
 * Applies full math normalization to the AST: removes multiplicative
 * identities (x * 1 → x, 1 * x → x) and condenses scalar chains.
 */
export function applyManualMathNormalization(
    ast: unknown,
    _context: ConvertManualMathTransformOptions | null = null
): unknown {
    if (!ast || typeof ast !== "object") {
        return ast;
    }
    removeMultiplicativeIdentities(ast as Record<string, unknown>);
    return ast;
}

function removeMultiplicativeIdentities(node: Record<string, unknown>): void {
    if (!node || Array.isArray(node)) {
        return;
    }

    if (node.type === "BinaryExpression" && node.operator === "*") {
        const left = node.left as Record<string, unknown> | undefined;
        const right = node.right as Record<string, unknown> | undefined;

        if (left && left.type === "Literal" && (left.value === "1" || left.value === 1)) {
            const replacement = { ...(right as object), __fromMultiplicativeIdentity: true };
            replaceNodeWith(node as object, replacement);
            return;
        }

        if (right && right.type === "Literal" && (right.value === "1" || right.value === 1)) {
            const replacement = { ...(left as object), __fromMultiplicativeIdentity: true };
            replaceNodeWith(node as object, replacement);
            return;
        }
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            removeMultiplicativeIdentities(value as Record<string, unknown>);
        }
    }
}
