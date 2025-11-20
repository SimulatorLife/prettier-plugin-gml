export declare const GML_IDENTIFIER_METADATA_URL: import("url").URL;
export declare const GML_IDENTIFIER_METADATA_PATH: string;
/**
 * Load the bundled identifier metadata JSON artefact.
 *
 * Centralizing path resolution keeps consumers from depending on the
 * repository layout and enables callers to treat the metadata as an injected
 * dependency rather than reaching into package internals.
 *
 * @returns {unknown} Raw identifier metadata payload bundled with the package.
 */
export declare function loadBundledIdentifierMetadata(): any;
/**
 * Retrieve the cached identifier metadata payload.
 *
 * @returns {unknown} Cached identifier metadata payload.
 */
export declare function getIdentifierMetadata(): any;
/**
 * Reset the metadata cache so test harnesses can force a reload.
 */
export declare function clearIdentifierMetadataCache(): void;
/**
 * Normalize the identifier metadata entries by extracting and validating
 * each entry from the raw payload.
 * @param {*} metadata
 * @returns {Array<{ name: string, type: string, descriptor: object }>}
 */
export declare function normalizeIdentifierMetadataEntries(metadata: any): any[];
