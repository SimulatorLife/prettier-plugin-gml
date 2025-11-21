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
