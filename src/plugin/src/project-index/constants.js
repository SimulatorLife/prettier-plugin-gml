export const PROJECT_MANIFEST_EXTENSION = ".yyp";
export const PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE =
    "Project root discovery was aborted.";
export const PROJECT_INDEX_BUILD_ABORT_MESSAGE =
    "Project index build was aborted.";

const PROJECT_MANIFEST_EXTENSION_LOWER =
    PROJECT_MANIFEST_EXTENSION.toLowerCase();

export function isProjectManifestPath(candidate) {
    if (typeof candidate !== "string") {
        return false;
    }

    if (candidate.length === 0) {
        return false;
    }

    return candidate.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION_LOWER);
}
