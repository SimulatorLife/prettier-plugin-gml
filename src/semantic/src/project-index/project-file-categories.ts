import { Core } from "@gml-modules/core";

import {
    isProjectManifestPath,
    isProjectResourceMetadataPath
} from "./constants.js";

const DEFAULT_PROJECT_SOURCE_EXTENSIONS = Object.freeze([".gml"]);
let projectSourceExtensions = DEFAULT_PROJECT_SOURCE_EXTENSIONS;

export const ProjectFileCategory = Object.freeze({
    RESOURCE_METADATA: "yy",
    SOURCE: "gml"
});

const PROJECT_FILE_CATEGORIES = new Set(Object.values(ProjectFileCategory));

const PROJECT_FILE_CATEGORY_CHOICES = Object.freeze(
    [...PROJECT_FILE_CATEGORIES]
        .reduce((acc, item) => {
            const insertIndex = acc.findIndex((existing) => existing > item);
            return insertIndex === -1
                ? [...acc, item]
                : [
                      ...acc.slice(0, insertIndex),
                      item,
                      ...acc.slice(insertIndex)
                  ];
        }, [])
        .join(", ")
);

/**
 * Retrieve the ordered list of file extensions treated as GML sources when
 * categorizing project files. The array is frozen so callers can safely rely on
 * reference stability and avoid accidental mutation between lookups.
 *
 * @returns {readonly string[]} Normalized extensions beginning with a leading
 *          dot (for example, ".gml").
 */
export function getProjectIndexSourceExtensions() {
    return projectSourceExtensions;
}

/**
 * Reset the recognized source extensions to the built-in defaults so tests can
 * restore global state after overriding the list.
 *
 * @returns {readonly string[]} The default extension list.
 */
export function resetProjectIndexSourceExtensions() {
    projectSourceExtensions = DEFAULT_PROJECT_SOURCE_EXTENSIONS;
    return projectSourceExtensions;
}

/**
 * Normalize user-provided source extensions by trimming whitespace, forcing a
 * leading dot, lowercasing, and de-duplicating while preserving the built-in
 * defaults.
 *
 * @param {readonly string[]} extensions Candidate extension strings.
 * @returns {readonly string[]} Frozen list containing the defaults plus any
 *          normalized additions.
 */
function normalizeProjectSourceExtensions(extensions) {
    const normalizedExtensions = Core.assertArray(extensions, {
        errorMessage:
            "Project source extensions must be provided as an array of strings."
    });

    const normalized = new Set(DEFAULT_PROJECT_SOURCE_EXTENSIONS);

    for (const extension of normalizedExtensions) {
        if (typeof extension !== "string") {
            throw new TypeError(
                "Project source extensions must be strings (for example '.gml')."
            );
        }

        const normalizedExtension =
            Core.normalizeExtensionSuffix(extension);
        if (!normalizedExtension) {
            throw new TypeError(
                "Project source extensions cannot be empty strings."
            );
        }

        normalized.add(normalizedExtension);
    }

    return Object.freeze([...normalized]);
}

/**
 * Override the recognized source extensions used during project indexing.
 * Callers typically invoke this in tests to ensure alternate file types are
 * categorized as sources.
 *
 * @param {readonly string[]} extensions New extension list. Each entry may
 *        include or omit the leading dot and will be normalized.
 * @returns {readonly string[]} Frozen, normalized extension list.
 */
export function setProjectIndexSourceExtensions(extensions) {
    projectSourceExtensions = normalizeProjectSourceExtensions(extensions);
    return projectSourceExtensions;
}

/**
 * Validate a potential project file category and normalize it to one of the
 * known constants.
 *
 * @param {unknown} value Candidate category value.
 * @returns {ProjectFileCategory} Normalized category when valid.
 * @throws {RangeError} When `value` does not map to a known category.
 */
export function normalizeProjectFileCategory(value) {
    if (PROJECT_FILE_CATEGORIES.has(value)) {
        return value;
    }

    const received = value === undefined ? "undefined" : `'${String(value)}'`;
    throw new RangeError(
        `Project file category must be one of: ${PROJECT_FILE_CATEGORY_CHOICES}. Received ${received}.`
    );
}

/**
 * Determine the project category for a path relative to the project root.
 * Resource metadata files (`.yy` and the project manifest) are detected first,
 * then any of the configured source extensions.
 *
 * @param {string} relativePosix Project-relative path using POSIX separators.
 * @returns {ProjectFileCategory | null} Matching category or `null` when the
 *          path does not fall into a known bucket.
 */
export function resolveProjectFileCategory(relativePosix) {
    if (
        isProjectResourceMetadataPath(relativePosix) ||
        isProjectManifestPath(relativePosix)
    ) {
        return ProjectFileCategory.RESOURCE_METADATA;
    }
    const lowerPath = relativePosix.toLowerCase();
    const sourceExtensions = getProjectIndexSourceExtensions();
    if (sourceExtensions.some((extension) => lowerPath.endsWith(extension))) {
        return ProjectFileCategory.SOURCE;
    }
    return null;
}
