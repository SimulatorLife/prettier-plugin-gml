// Helpers focused solely on semicolon emission rules within the printer.

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
function nodeTypeNeedsSemicolon(type?: string) {
    return type ? NODE_TYPES_REQUIRING_SEMICOLON.has(type) : false;
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
export function optionalSemicolon(nodeType?: string) {
    return nodeTypeNeedsSemicolon(nodeType) ? ";" : "";
}
