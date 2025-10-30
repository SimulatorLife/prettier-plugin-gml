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
 * Centralising path resolution keeps consumers from depending on the
 * repository layout and enables callers to treat the metadata as an injected
 * dependency rather than reaching into package internals.
 *
 * @returns {unknown}
 */
export function loadBundledIdentifierMetadata() {
    return require(GML_IDENTIFIER_METADATA_PATH);
}

/** @type {unknown | null} */
let cachedIdentifierMetadata = null;

/**
 * Retrieve the cached identifier metadata payload.
 *
 * @returns {unknown}
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
