export declare const FEATHER_METADATA_URL: import("url").URL;
export declare const FEATHER_METADATA_PATH: string;
export declare function loadBundledFeatherMetadata(): any;
declare function normalizeFeatherMetadata(payload: any): any;
/**
 * Retrieve the shared Feather metadata payload bundled with the semantic
 * package.
 *
 * @returns {FeatherMetadata} Bundled Feather metadata payload.
 */
export declare function getFeatherMetadata(): any;
/**
 * Return the list of Feather diagnostics declared in the bundled metadata.
 *
 * @returns {Array<FeatherDiagnostic>} Array of diagnostics declared in the bundled metadata.
 */
export declare function getFeatherDiagnostics(): readonly any[];
/**
 * Look up a single Feather diagnostic by its identifier.
 *
 * @param {string | null | undefined} id Diagnostic identifier to find.
 * @returns {FeatherDiagnostic | null} Matching diagnostic when found; otherwise `null`.
 */
export declare function getFeatherDiagnosticById(id: any): any;
export declare const __normalizeFeatherMetadataForTests: typeof normalizeFeatherMetadata;
export {};
