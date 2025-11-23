/**
 * Enumerated scope override keywords supported by the semantic scope tracker.
 *
 * The values are frozen to avoid accidental mutations when the constants are
 * re-exported through the public API surface.
 */
export const ScopeOverrideKeyword = Object.freeze({
    GLOBAL: "global"
});

const SCOPE_OVERRIDE_KEYWORD_SET: Set<string> = new Set<string>(
    Object.values(ScopeOverrideKeyword) as string[]
);

export function isScopeOverrideKeyword(value) {
    return typeof value === "string" && SCOPE_OVERRIDE_KEYWORD_SET.has(value);
}

export function formatKnownScopeOverrideKeywords() {
    return [...SCOPE_OVERRIDE_KEYWORD_SET].join(", ");
}
