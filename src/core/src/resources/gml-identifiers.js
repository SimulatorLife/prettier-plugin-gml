import { createRequire } from "node:module";
import {
    resolveBundledResourcePath,
    resolveBundledResourceUrl
} from "./resource-locator.js";
const require = createRequire(import.meta.url);
export const GML_IDENTIFIER_METADATA_URL = resolveBundledResourceUrl(
    "gml-identifiers.json"
);
export const GML_IDENTIFIER_METADATA_PATH = resolveBundledResourcePath(
    "gml-identifiers.json"
);
/**
 * Load the bundled identifier metadata JSON artefact.
 *
 * Centralizing path resolution keeps consumers from depending on the
 * repository layout and enables callers to treat the metadata as an injected
 * dependency rather than reaching into package internals.
 *
 * @returns {unknown} Raw identifier metadata payload bundled with the package.
 */
export function loadBundledIdentifierMetadata() {
    return require(GML_IDENTIFIER_METADATA_PATH);
}
/** @type {unknown | null} */
let cachedIdentifierMetadata = null;
/**
 * Retrieve the cached identifier metadata payload.
 *
 * @returns {unknown} Cached identifier metadata payload.
 */
export function getIdentifierMetadata() {
    if (cachedIdentifierMetadata === null) {
        cachedIdentifierMetadata = loadBundledIdentifierMetadata();
    }
    return cachedIdentifierMetadata;
}
/**
 * Reset the metadata cache so test harnesses can force a reload.
 */
export function clearIdentifierMetadataCache() {
    cachedIdentifierMetadata = null;
}
/**
 * Normalize the identifier metadata entries by extracting and validating
 * each entry from the raw payload.
 * @param {*} metadata
 * @returns {Array<{ name: string, type: string, descriptor: object }>}
 */
export function normalizeIdentifierMetadataEntries(metadata) {
    const identifiers =
        metadata && typeof metadata === "object" && metadata.identifiers;
    if (!identifiers || typeof identifiers !== "object") {
        return [];
    }
    return Object.entries(identifiers).reduce((entries, [name, descriptor]) => {
        if (!name) {
            return entries;
        }
        // Descriptor must be a non-null object
        if (!descriptor || typeof descriptor !== "object") {
            return entries;
        }
        const type =
            typeof descriptor.type === "string"
                ? descriptor.type.toLowerCase()
                : "";
        entries.push({ name, type, descriptor });
        return entries;
    }, []);
}
//# sourceMappingURL=gml-identifiers.js.map
