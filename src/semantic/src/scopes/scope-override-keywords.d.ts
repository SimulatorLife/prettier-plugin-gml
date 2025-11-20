/**
 * Enumerated scope override keywords supported by the semantic scope tracker.
 *
 * The values are frozen to avoid accidental mutations when the constants are
 * re-exported through the public API surface.
 */
export declare const ScopeOverrideKeyword: Readonly<{
    GLOBAL: "global";
}>;
export declare function isScopeOverrideKeyword(value: any): boolean;
export declare function formatKnownScopeOverrideKeywords(): string;
