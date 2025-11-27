import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESOURCE_BASE_PATHS = Object.freeze([ // TODO: There must be a better way to do this
    "../../../../resources/",
    "../../../../../resources/"
]);

function resolveResourceUrlForExistingBase(resourceName: string): URL {
    for (const basePath of RESOURCE_BASE_PATHS) {
        const candidateBaseUrl = new URL(basePath, import.meta.url);
        const candidateResourceUrl = new URL(resourceName, candidateBaseUrl);
        const candidatePath = fileURLToPath(candidateResourceUrl);

        if (existsSync(candidatePath)) {
            return candidateResourceUrl;
        }
    }

    return new URL(
        resourceName,
        new URL(RESOURCE_BASE_PATHS[0], import.meta.url)
    );
}

/**
 * Resolve a URL pointing at a bundled resource artefact.
 *
 * Centralizing the resolution protects call sites from relying on directory
 * depth or package layout, making it easier to relocate resource assets.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {URL} Absolute file URL referencing the bundled artefact.
 */
export function resolveBundledResourceUrl(resourceName: string): URL {
    if (typeof resourceName !== "string" || resourceName.length === 0) {
        throw new TypeError("Resource name must be a non-empty string.");
    }

    return resolveResourceUrlForExistingBase(resourceName);
}

/**
 * Resolve a filesystem path for a bundled resource artefact.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {string} Local filesystem path for the bundled artefact.
 */
export function resolveBundledResourcePath(resourceName: string): string {
    return fileURLToPath(resolveBundledResourceUrl(resourceName));
}
