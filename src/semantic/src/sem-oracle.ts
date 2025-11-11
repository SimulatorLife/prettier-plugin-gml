export type SemKind = "local" | "self_field" | "other_field" | "global_field" | "builtin" | "script";

export interface SemOracle {
  // identifier node → kind + resolved fully-qualified name (for scripts/vars)
  kindOfIdent(node: any): SemKind;
  nameOfIdent(node: any): string;         // raw text (e.g., "hp", "scr_damage_enemy")
  qualifiedSymbol(node: any): string | null; // e.g., "gml/script/scr_damage_enemy" or null if non-symbol

  // call node → is this a script call or builtin?
  callTargetKind(node: any): "script" | "builtin" | "unknown";
  callTargetSymbol(node: any): string | null; // symbol if known (e.g., gml/script/xxx)
}
