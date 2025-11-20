/**
 * @typedef {"script"|"event"|"object"|"macro"|"enum"|"var"} GmlSymbolKind
 */
/**
 * Create a stable SCIP symbol string for a GML symbol.
 * @param {GmlSymbolKind} kind
 * @param {string} name
 */
export declare function sym(kind: any, name: any): string;
declare const _default: {
    sym: typeof sym;
};
export default _default;
