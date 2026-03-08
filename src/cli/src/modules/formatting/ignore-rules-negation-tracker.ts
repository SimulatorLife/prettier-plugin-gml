/**
 * Tracks whether any ignore files contain negated rules (patterns starting with !).
 * Simple module-level flag that is reset between formatting runs.
 */
let hasNegatedIgnoreRulesInternal = false;

/**
 * Check if negated ignore rules have been detected.
 * @returns true if any ignore file contains a negated pattern (starting with !)
 */
export function hasNegatedIgnoreRules(): boolean {
    return hasNegatedIgnoreRulesInternal;
}

/**
 * Reset the negated ignore rules flag.
 * Called during formatting session initialization.
 */
export function resetNegatedIgnoreRulesFlag(): void {
    hasNegatedIgnoreRulesInternal = false;
}

/**
 * Mark that negated ignore rules have been detected.
 * Called when scanning ignore files finds a pattern starting with !.
 */
export function markNegatedIgnoreRulesDetected(): void {
    hasNegatedIgnoreRulesInternal = true;
}
