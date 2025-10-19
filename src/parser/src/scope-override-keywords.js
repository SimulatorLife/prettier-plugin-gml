const ScopeOverrideKeyword = Object.freeze({
    GLOBAL: "global"
});

const SCOPE_OVERRIDE_KEYWORD_SET = new Set(
    Object.values(ScopeOverrideKeyword)
);

export function isScopeOverrideKeyword(value) {
    return typeof value === "string" && SCOPE_OVERRIDE_KEYWORD_SET.has(value);
}

export function formatKnownScopeOverrideKeywords() {
    return [...SCOPE_OVERRIDE_KEYWORD_SET].join(", ");
}

export { ScopeOverrideKeyword };
