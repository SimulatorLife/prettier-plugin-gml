import { getNonEmptyTrimmedString } from "../dependencies.js";

export const PROJECT_MANIFEST_EXTENSION = ".yyp";

const PROJECT_MANIFEST_EXTENSION_LOWER =
    PROJECT_MANIFEST_EXTENSION.toLowerCase();

/**
 * Canonical suffixes treated as GameMaker resource metadata. The formatter
 * keeps this list opinionated by default and only expands it when callers
 * explicitly opt in via the extension hook.
 */
const DEFAULT_RESOURCE_METADATA_EXTENSIONS = Object.freeze([".yy"]);

let projectResourceMetadataExtensions = DEFAULT_RESOURCE_METADATA_EXTENSIONS;

function normalizeResourceMetadataExtension(candidate) {
    const trimmed = getNonEmptyTrimmedString(candidate);
    if (!trimmed) {
        return null;
    }

    const prefixed = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    if (prefixed === ".") {
        return null;
    }

    return prefixed.toLowerCase();
}

function entriesMatchDefault(normalized) {
    return (
        normalized.length === DEFAULT_RESOURCE_METADATA_EXTENSIONS.length &&
        normalized.every(
            (value, index) =>
                value === DEFAULT_RESOURCE_METADATA_EXTENSIONS[index]
        )
    );
}

function isIterable(candidate) {
    return (
        candidate != null &&
        typeof candidate !== "string" &&
        typeof candidate[Symbol.iterator] === "function"
    );
}

function normalizeResourceMetadataExtensions(candidate) {
    let values;

    if (typeof candidate === "string") {
        values = [candidate];
    } else if (isIterable(candidate)) {
        values = Array.from(candidate);
    } else {
        values = [];
    }

    const normalized = [...DEFAULT_RESOURCE_METADATA_EXTENSIONS];
    const seen = new Set(normalized);

    for (const entry of values) {
        const extension = normalizeResourceMetadataExtension(entry);
        if (!extension || seen.has(extension)) {
            continue;
        }

        normalized.push(extension);
        seen.add(extension);
    }

    if (normalized.length === DEFAULT_RESOURCE_METADATA_EXTENSIONS.length) {
        return DEFAULT_RESOURCE_METADATA_EXTENSIONS;
    }

    return Object.freeze(normalized);
}

/**
 * Return the normalized metadata extension when a candidate path matches one of
 * the registered suffixes. The result keeps comparisons case-insensitive while
 * allowing callers to trim the original value predictably.
 */
export function matchProjectResourceMetadataExtension(candidate) {
    if (typeof candidate !== "string" || candidate.length === 0) {
        return null;
    }

    const lowerCandidate = candidate.toLowerCase();
    for (const extension of projectResourceMetadataExtensions) {
        if (lowerCandidate.endsWith(extension)) {
            return extension;
        }
    }

    return null;
}

/**
 * Return the frozen list of recognized resource metadata extensions. The array
 * always exposes the canonical `.yy` suffix first so diagnostics remain
 * predictable.
 */
export function getProjectResourceMetadataExtensions() {
    return projectResourceMetadataExtensions;
}

/**
 * Override the recognized resource metadata suffixes used while categorizing
 * project files. Intended for internal integrations, tests, or experimental
 * tooling—end users should rely on the opinionated defaults exposed by the
 * formatter. The override list is normalized, deduplicated, and seeded with the
 * stock `.yy` entry.
 */
export function setProjectResourceMetadataExtensions(extensions) {
    projectResourceMetadataExtensions =
        normalizeResourceMetadataExtensions(extensions);
    return projectResourceMetadataExtensions;
}

/**
 * Restore the resource metadata extension list to its default contents. Useful
 * for tests that temporarily override the recognized suffixes.
 */
export function resetProjectResourceMetadataExtensions() {
    projectResourceMetadataExtensions = DEFAULT_RESOURCE_METADATA_EXTENSIONS;
    return projectResourceMetadataExtensions;
}

/**
 * Determine whether a path ends with a recognized resource metadata suffix.
 */
export function isProjectResourceMetadataPath(candidate) {
    return matchProjectResourceMetadataExtension(candidate) !== null;
}

export function isProjectManifestPath(candidate) {
    if (typeof candidate !== "string") {
        return false;
    }

    if (candidate.length === 0) {
        return false;
    }

    return candidate.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION_LOWER);
}

export { DEFAULT_RESOURCE_METADATA_EXTENSIONS as PROJECT_RESOURCE_METADATA_DEFAULTS };
