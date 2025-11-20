import { Core } from "@gml-modules/core";
const { Utils: { applyConfiguredValueEnvOverride, createEnvConfiguredValueWithFallback, toFiniteNumber } } = Core;
const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR = "GML_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES";
const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE = 128;
function normalizeMaxEntries(value, { fallback }) {
    if (value == null) {
        return fallback;
    }
    if (value === Infinity) {
        return Infinity;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") {
            return fallback;
        }
        const lower = trimmed.toLowerCase();
        if (lower === "infinity" || lower === "inf") {
            return Infinity;
        }
        const numeric = toFiniteNumber(trimmed);
        if (numeric === null) {
            return fallback;
        }
        return normalizeFiniteMaxEntries(numeric);
    }
    if (typeof value === "number") {
        const numeric = toFiniteNumber(value);
        if (numeric === null) {
            return fallback;
        }
        return normalizeFiniteMaxEntries(numeric);
    }
    return fallback;
}
function normalizeFiniteMaxEntries(value) {
    if (value <= 0) {
        return 0;
    }
    return Math.floor(value);
}
const identifierCaseOptionStoreMaxEntriesConfig = createEnvConfiguredValueWithFallback({
    defaultValue: IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE,
    envVar: IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR,
    resolve: (raw, context) => normalizeMaxEntries(raw, { fallback: context.fallback }),
    computeFallback: ({ defaultValue }) => defaultValue
});
function getDefaultIdentifierCaseOptionStoreMaxEntries() {
    return identifierCaseOptionStoreMaxEntriesConfig.get();
}
function setDefaultIdentifierCaseOptionStoreMaxEntries(maxEntries) {
    return identifierCaseOptionStoreMaxEntriesConfig.set(maxEntries);
}
function applyIdentifierCaseOptionStoreEnvOverride(env) {
    applyConfiguredValueEnvOverride(identifierCaseOptionStoreMaxEntriesConfig, env);
}
applyIdentifierCaseOptionStoreEnvOverride();
const DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES = getDefaultIdentifierCaseOptionStoreMaxEntries();
export { DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES, IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE, IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR, applyIdentifierCaseOptionStoreEnvOverride, getDefaultIdentifierCaseOptionStoreMaxEntries, setDefaultIdentifierCaseOptionStoreMaxEntries };
//# sourceMappingURL=option-store-defaults.js.map