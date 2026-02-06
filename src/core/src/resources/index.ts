export {
    clearIdentifierMetadataCache,
    getIdentifierMetadata,
    GML_IDENTIFIER_METADATA_PATH,
    GML_IDENTIFIER_METADATA_URL,
    loadBundledIdentifierMetadata,
    loadManualFunctionNames,
    loadReservedIdentifierNames,
    normalizeIdentifierMetadataEntries,
    resetReservedIdentifierMetadataLoader,
    setReservedIdentifierMetadataLoader
} from "./gml-identifier-loading.js";
export { resolveBundledResourcePath, resolveBundledResourceUrl } from "./resource-locator.js";
