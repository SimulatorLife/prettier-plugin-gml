let ignoreRulesContainNegations = false;

export function hasIgnoreRuleNegations() {
    return ignoreRulesContainNegations;
}

export function markIgnoreRuleNegationsDetected() {
    ignoreRulesContainNegations = true;
}

export function resetIgnoreRuleNegations() {
    ignoreRulesContainNegations = false;
}
