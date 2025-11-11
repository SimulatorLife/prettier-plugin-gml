export type GmlSymbolKind = "script" | "event" | "object" | "macro" | "enum" | "var";

export function sym(kind: GmlSymbolKind, name: string): string {
  // Keep ASCII + stable; consumers rely on this for diffs
  return `gml/${kind}/${name}`;
}
