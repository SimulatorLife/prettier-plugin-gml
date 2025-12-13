/**
 * Tracks whether any ignore files contain negated rules (patterns starting with !).
 * Exported as a mutable object to allow direct property access while maintaining
 * a clear boundary around the state.
 */
export const ignoreRuleNegations = {
    detected: false
};
