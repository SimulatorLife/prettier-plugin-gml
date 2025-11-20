export declare const PROJECT_MANIFEST_EXTENSION = ".yyp";
/**
 * Canonical suffixes treated as GameMaker resource metadata. The formatter
 * keeps this list opinionated by default and only expands it when callers
 * explicitly opt in via the extension hook.
 */
declare const DEFAULT_RESOURCE_METADATA_EXTENSIONS: readonly string[];
/**
 * Return the normalized metadata extension when a candidate path matches one of
 * the registered suffixes. The result keeps comparisons case-insensitive while
 * allowing callers to trim the original value predictably.
 */
export declare function matchProjectResourceMetadataExtension(candidate: any): string;
/**
 * Return the frozen list of recognized resource metadata extensions. The array
 * always exposes the canonical `.yy` suffix first so diagnostics remain
 * predictable.
 */
export declare function getProjectResourceMetadataExtensions(): readonly string[];
/**
 * Override the recognized resource metadata suffixes used while categorizing
 * project files. Intended for internal integrations, tests, or experimental
 * tooling—end users should rely on the opinionated defaults exposed by the
 * formatter. The override list is normalized, deduplicated, and seeded with the
 * stock `.yy` entry.
 */
export declare function setProjectResourceMetadataExtensions(extensions: any): readonly string[];
/**
 * Restore the resource metadata extension list to its default contents. Useful
 * for tests that temporarily override the recognized suffixes.
 */
export declare function resetProjectResourceMetadataExtensions(): readonly string[];
/**
 * Determine whether a path ends with a recognized resource metadata suffix.
 */
export declare function isProjectResourceMetadataPath(candidate: any): boolean;
export declare function isProjectManifestPath(candidate: any): boolean;
export { DEFAULT_RESOURCE_METADATA_EXTENSIONS as PROJECT_RESOURCE_METADATA_DEFAULTS };
