export declare const ProjectFileCategory: Readonly<{
    RESOURCE_METADATA: "yy";
    SOURCE: "gml";
}>;
/**
 * Retrieve the ordered list of file extensions treated as GML sources when
 * categorizing project files. The array is frozen so callers can safely rely on
 * reference stability and avoid accidental mutation between lookups.
 *
 * @returns {readonly string[]} Normalized extensions beginning with a leading
 *          dot (for example, ".gml").
 */
export declare function getProjectIndexSourceExtensions(): readonly string[];
/**
 * Reset the recognized source extensions to the built-in defaults so tests can
 * restore global state after overriding the list.
 *
 * @returns {readonly string[]} The default extension list.
 */
export declare function resetProjectIndexSourceExtensions(): readonly string[];
/**
 * Override the recognized source extensions used during project indexing.
 * Callers typically invoke this in tests to ensure alternate file types are
 * categorized as sources.
 *
 * @param {readonly string[]} extensions New extension list. Each entry may
 *        include or omit the leading dot and will be normalized.
 * @returns {readonly string[]} Frozen, normalized extension list.
 */
export declare function setProjectIndexSourceExtensions(extensions: any): readonly string[];
/**
 * Validate a potential project file category and normalize it to one of the
 * known constants.
 *
 * @param {unknown} value Candidate category value.
 * @returns {ProjectFileCategory} Normalized category when valid.
 * @throws {RangeError} When `value` does not map to a known category.
 */
export declare function normalizeProjectFileCategory(value: any): any;
/**
 * Determine the project category for a path relative to the project root.
 * Resource metadata files (`.yy` and the project manifest) are detected first,
 * then any of the configured source extensions.
 *
 * @param {string} relativePosix Project-relative path using POSIX separators.
 * @returns {ProjectFileCategory | null} Matching category or `null` when the
 *          path does not fall into a known bucket.
 */
export declare function resolveProjectFileCategory(relativePosix: any): "gml" | "yy";
