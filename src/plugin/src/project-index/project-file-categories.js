import { isProjectManifestPath } from "./constants.js";

const DEFAULT_PROJECT_SOURCE_EXTENSIONS = Object.freeze([".gml"]);
let projectSourceExtensions = DEFAULT_PROJECT_SOURCE_EXTENSIONS;

export const ProjectFileCategory = Object.freeze({
    RESOURCE_METADATA: "yy",
    SOURCE: "gml"
});

const PROJECT_FILE_CATEGORIES = new Set(Object.values(ProjectFileCategory));

const PROJECT_FILE_CATEGORY_CHOICES = Object.freeze(
    [...PROJECT_FILE_CATEGORIES].sort().join(", ")
);

export function getProjectIndexSourceExtensions() {
    return projectSourceExtensions;
}

export function resetProjectIndexSourceExtensions() {
    projectSourceExtensions = DEFAULT_PROJECT_SOURCE_EXTENSIONS;
    return projectSourceExtensions;
}

function normalizeProjectSourceExtensions(extensions) {
    if (!Array.isArray(extensions)) {
        throw new TypeError(
            "Project source extensions must be provided as an array of strings."
        );
    }

    const normalized = new Set(DEFAULT_PROJECT_SOURCE_EXTENSIONS);

    for (const extension of extensions) {
        if (typeof extension !== "string") {
            throw new TypeError(
                "Project source extensions must be strings (for example '.gml')."
            );
        }

        const trimmed = extension.trim();
        if (trimmed.length === 0) {
            throw new TypeError(
                "Project source extensions cannot be empty strings."
            );
        }

        const candidate = trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
        normalized.add(candidate.toLowerCase());
    }

    return Object.freeze([...normalized]);
}

export function setProjectIndexSourceExtensions(extensions) {
    projectSourceExtensions = normalizeProjectSourceExtensions(extensions);
    return projectSourceExtensions;
}

export function normalizeProjectFileCategory(value) {
    if (PROJECT_FILE_CATEGORIES.has(value)) {
        return value;
    }

    const received = value === undefined ? "undefined" : `'${String(value)}'`;
    throw new RangeError(
        `Project file category must be one of: ${PROJECT_FILE_CATEGORY_CHOICES}. Received ${received}.`
    );
}

export function resolveProjectFileCategory(relativePosix) {
    const lowerPath = relativePosix.toLowerCase();
    if (lowerPath.endsWith(".yy") || isProjectManifestPath(relativePosix)) {
        return ProjectFileCategory.RESOURCE_METADATA;
    }
    const sourceExtensions = getProjectIndexSourceExtensions();
    if (sourceExtensions.some((extension) => lowerPath.endsWith(extension))) {
        return ProjectFileCategory.SOURCE;
    }
    return null;
}
