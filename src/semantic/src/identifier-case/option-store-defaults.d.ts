declare const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR =
    "GML_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES";
declare const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE = 128;
declare function getDefaultIdentifierCaseOptionStoreMaxEntries(): any;
declare function setDefaultIdentifierCaseOptionStoreMaxEntries(
    maxEntries: any
): any;
declare function applyIdentifierCaseOptionStoreEnvOverride(env: any): void;
declare const DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES: any;
export {
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR,
    applyIdentifierCaseOptionStoreEnvOverride,
    getDefaultIdentifierCaseOptionStoreMaxEntries,
    setDefaultIdentifierCaseOptionStoreMaxEntries
};
