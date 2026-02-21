/**
 * Discriminated union of all GML symbol kinds used in SCIP symbol strings.
 */
export type GmlSymbolKind = "script" | "event" | "object" | "macro" | "enum" | "var";

/**
 * Create a stable SCIP symbol string for a GML symbol.
 */
export function sym(kind: GmlSymbolKind, name: string): string {
    return `gml/${kind}/${name}`;
}
