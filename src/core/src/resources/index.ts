export {
    FEATHER_METADATA_PATH,
    FEATHER_METADATA_URL,
    getFeatherDiagnosticById,
    getFeatherDiagnostics,
    getFeatherMetadata,
    loadBundledFeatherMetadata
} from "./feather-metadata.js";
export {
    clearIdentifierMetadataCache,
    getIdentifierMetadata,
    GML_IDENTIFIER_METADATA_PATH,
    GML_IDENTIFIER_METADATA_URL,
    loadBundledIdentifierMetadata,
    loadReservedIdentifierNames,
    normalizeIdentifierMetadataEntries,
    resetReservedIdentifierMetadataLoader,
    setReservedIdentifierMetadataLoader
} from "./gml-identifier-loading.js";
export {
    resolveBundledResourcePath,
    resolveBundledResourceUrl
} from "./resource-locator.js";
export * from "./feather-type-system.js";
export {
    buildDeprecatedBuiltinVariableReplacements,
    getDeprecatedBuiltinReplacementEntry,
    type DeprecatedReplacementEntry
} from "./deprecated-builtin-variable-replacements.js";
