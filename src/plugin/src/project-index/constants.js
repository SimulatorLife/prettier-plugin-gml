export const PROJECT_MANIFEST_EXTENSION = ".yyp";

const PROJECT_MANIFEST_EXTENSION_LOWER =
    PROJECT_MANIFEST_EXTENSION.toLowerCase();

export function isProjectManifestPath(candidate) {
    if (typeof candidate !== "string") {
        return false;
    }

    if (candidate.length === 0) {
        return false;
    }

    return candidate.toLowerCase().endsWith(
        PROJECT_MANIFEST_EXTENSION_LOWER
    );
}
