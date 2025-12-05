// Using a Set avoids re-allocating the list for every membership check when
// these helpers run inside tight printer loops.
const NODE_TYPES_REQUIRING_SEMICOLON = new Set([
    "CallExpression",
    "AssignmentExpression",
    "ExpressionStatement",
    "GlobalVarStatement",
    "ReturnStatement",
    "BreakStatement",
    "ContinueStatement",
    "ExitStatement",
    "ThrowStatement",
    "IncDecStatement",
    "VariableDeclaration",
    "DeleteStatement"
]);

/**
 * Guard helper for {@link optionalSemicolon} to keep the membership logic
 * centralized. The printer ends up consulting this list in several hot paths,
 * so caching the lookup in a `Set` keeps call sites tidy without introducing
 * repeated allocations.
 *
 * @param {string | undefined} type Node `type` value to evaluate.
 * @returns {boolean} `true` when the node type must be terminated with a
 *                    semicolon.
 */
function nodeTypeNeedsSemicolon(type) {
    return NODE_TYPES_REQUIRING_SEMICOLON.has(type);
}

/**
 * Determine whether the current AST path points to the final statement within
 * its parent's body array. The printer uses this to decide when it can omit
 * trailing semicolons or blank lines without peeking outside the current
 * subtree.
 *
 * @param {import("prettier").AstPath} path AST path for the node being printed.
 * @returns {boolean} `true` when the node is the last statement in its parent.
 */
export function isLastStatement(path) {
    const body = getParentNodeListProperty(path);
    if (!body) {
        return true;
    }
    const node: any = path.getValue();

    // `Array#at` supports negative indices but pays an extra bounds check on
    // every call. The printer hits this helper for nearly every statement
    // emission, so using direct index math keeps the hot path leaner while
    // preserving the existing semantics for empty arrays.
    const lastIndex = body.length - 1;
    return lastIndex >= 0 && body[lastIndex] === node;
}

/**
 * Walk up the AST path and return the parent's `body` array when present. The
 * printer cares primarily about statement order, so failing closed (`null`)
 * keeps consumers from accidentally iterating non-array structures.
 *
 * @param {import("prettier").AstPath} path Current AST path within the
 *        printer traversal.
 * @returns {Array<unknown> | null} Parent body array or `null` when the parent
 *          does not expose a list-like `body` property.
 */
function getParentNodeListProperty(path) {
    const parent = path.getParentNode();
    if (!parent) {
        return null;
    }
    return getNodeListProperty(parent);
}

/**
 * Normalizes the `body` property lookup used throughout the printer so callers
 * can treat list-bearing nodes uniformly. Returning `null` for non-arrays keeps
 * the guard symmetric with {@link getParentNodeListProperty}.
 *
 * @param {unknown} node Candidate AST node to inspect.
 * @returns {Array<unknown> | null} `body` array when present, otherwise `null`.
 */
function getNodeListProperty(node) {
    const body = node.body;
    return Array.isArray(body) ? body : null;
}

/**
 * Convenience wrapper that returns the semicolon literal only when the printer
 * recognizes the node type as statement-terminating. Returning an empty string
 * avoids conditional logic at each call site and keeps the control flow easy to
 * scan within template literal builders.
 *
 * @param {string | undefined} nodeType AST node `type` to evaluate.
 * @returns {"" | ";"} Semicolon string when required, otherwise an empty string.
 */
export function optionalSemicolon(nodeType) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}
