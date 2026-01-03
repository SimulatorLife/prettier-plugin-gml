import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Fallback resource path resolution.
 *
 * DESIGN PROBLEM: This array contains hardcoded relative paths that attempt to locate
 * the shared `resources/` directory from different build output locations. The paths
 * vary depending on whether code is running from:
 *   - src/ (during development with ts-node or similar)
 *   - dist/ (after compilation)
 *   - nested subdirectories (e.g., dist/core/src/ vs dist/cli/src/)
 *
 * CURRENT STATE: The locator tries each path in sequence until it finds one that exists,
 * then uses that to resolve resource files. This is fragile and breaks if the build
 * structure changes or if new packages are added with different nesting levels.
 *
 * BETTER APPROACH: Compute the resource directory at build time or installation time
 * using one of these strategies:
 *   1. Define an environment variable (e.g., GML_RESOURCES_DIR) and read it at runtime.
 *   2. Use a build step to generate a config file with the absolute path to resources/.
 *   3. Walk upward from import.meta.url until a marker file (e.g., package.json with
 *      "name": "prettier-plugin-gml") is found, then resolve resources/ relative to that.
 *
 * WHAT WOULD BREAK: Removing these hardcoded paths without replacing them would cause
 * resource loading to fail in some build configurations. Implement one of the alternatives
 * above before removing this fallback array.
 */
const RESOURCE_BASE_PATHS = Object.freeze(["../../../../resources/", "../../../../../resources/"]);

function resolveResourceUrlForExistingBase(resourceName: string): URL {
    for (const basePath of RESOURCE_BASE_PATHS) {
        const candidateBaseUrl = new URL(basePath, import.meta.url);
        const candidateResourceUrl = new URL(resourceName, candidateBaseUrl);
        const candidatePath = fileURLToPath(candidateResourceUrl);

        if (existsSync(candidatePath)) {
            return candidateResourceUrl;
        }
    }

    return new URL(resourceName, new URL(RESOURCE_BASE_PATHS[0], import.meta.url));
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
