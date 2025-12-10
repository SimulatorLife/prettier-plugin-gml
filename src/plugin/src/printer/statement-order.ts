import type { AstPath } from "prettier";

/**
 * Determine whether the current AST path points to the final statement within
 * its parent's body array. The printer uses this to decide when it can omit
 * trailing semicolons or blank lines without peeking outside the current
 * subtree.
 *
 * @param {AstPath<unknown>} path AST path for the node being printed.
 * @returns {boolean} `true` when the node is the last statement in its parent.
 */
export function isLastStatement(path: AstPath<unknown>) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node = path.getValue();

    // `Array#at` supports negative indices but pays an extra bounds check on
    // every call. The printer hits this helper for nearly every statement
    // emission, so using direct index math keeps the hot path leaner while
    // preserving the existing semantics for empty arrays.
    const lastIndex = body.length - 1;
    return lastIndex >= 0 && body[lastIndex] === node;
}

function getParentNodeListProperty(path: AstPath<unknown>) {
    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }
    return getNodeListProperty(parent);
}

function getNodeListProperty(node: unknown) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const maybeBody = (node as { body?: unknown }).body;
    return Array.isArray(maybeBody) ? maybeBody : null;
}
