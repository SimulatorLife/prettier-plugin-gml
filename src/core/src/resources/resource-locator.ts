import { fileURLToPath } from "node:url";

const RESOURCES_BASE_URL = new URL(
    "../../../../../resources/",
    import.meta.url
);

/**
 * Resolve a URL pointing at a bundled resource artefact.
 *
 * Centralizing the resolution protects call sites from relying on directory
 * depth or package layout, making it easier to relocate resource assets.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {URL} Absolute file URL referencing the bundled artefact.
 */
export function resolveBundledResourceUrl(resourceName) {
    if (typeof resourceName !== "string" || resourceName.length === 0) {
        throw new TypeError("Resource name must be a non-empty string.");
    }

    return new URL(resourceName, RESOURCES_BASE_URL);
}

/**
 * Resolve a filesystem path for a bundled resource artefact.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {string} Local filesystem path for the bundled artefact.
 */
export function resolveBundledResourcePath(resourceName) {
    return fileURLToPath(resolveBundledResourceUrl(resourceName));
}
