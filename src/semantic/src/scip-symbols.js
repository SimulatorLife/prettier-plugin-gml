// Minimal JavaScript runtime for SCIP symbol helpers. The original source is
// authored in TypeScript (`scip-symbols.ts`). Provide a tiny JS implementation
// that mirrors the exported surface so runtime consumers can import it.
/**
 * @typedef {"script"|"event"|"object"|"macro"|"enum"|"var"} GmlSymbolKind
 */
/**
 * Create a stable SCIP symbol string for a GML symbol.
 * @param {GmlSymbolKind} kind
 * @param {string} name
 */
export function sym(kind, name) {
    return `gml/${kind}/${name}`;
}
export default { sym };
//# sourceMappingURL=scip-symbols.js.map
