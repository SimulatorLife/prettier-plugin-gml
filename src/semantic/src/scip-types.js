// Minimal JS version of the TypeScript `scip-types.ts` used by the
// `src/semantic/index.js` barrel. The original is authored in TypeScript; a
// tiny JS shim is provided during the migration so runtime imports succeed.
// Range tuple: [startLine, startCol, endLine, endCol]
export const ROLE_DEF = 1;
export const ROLE_REF = 0;
// The shape is documented in the TS file; at runtime we only need the
// constants to be present for code that imports them.
/** @typedef {[number, number, number, number]} Range4 */
/**
 * @typedef {{ range: Range4; symbol: string; symbolRoles: number }} ScipOccurrence
 */
/**
 * @typedef {{ relativePath: string; occurrences: ScipOccurrence[] }} ScipDocInput
 */
export default {
    ROLE_DEF,
    ROLE_REF
};
//# sourceMappingURL=scip-types.js.map
