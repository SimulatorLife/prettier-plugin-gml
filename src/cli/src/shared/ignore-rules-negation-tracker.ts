let ignoreRulesContainNegations = false;

export function hasIgnoreRuleNegations(): boolean {
    return ignoreRulesContainNegations;
}

export function markIgnoreRuleNegationsDetected(): void {
    ignoreRulesContainNegations = true;
}

export function resetIgnoreRuleNegations(): void {
    ignoreRulesContainNegations = false;
}
