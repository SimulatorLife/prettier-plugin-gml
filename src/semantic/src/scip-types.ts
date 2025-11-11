export type Range4 = [number, number, number, number]; // [startLine, startCol, endLine, endCol]
// Role bitmask per SCIP spec: DEFINITION bit is 1 << 0
export const ROLE_DEF = 1 as const;
export const ROLE_REF = 0 as const;

export interface ScipOccurrence {
  range: Range4;
  symbol: string;
  symbolRoles: typeof ROLE_DEF | typeof ROLE_REF;
}

export interface ScipDocInput {
  relativePath: string;
  occurrences: ScipOccurrence[];
}
