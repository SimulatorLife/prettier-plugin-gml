/**
 * Resolve a URL pointing at a bundled resource artefact.
 *
 * Centralizing the resolution protects call sites from relying on directory
 * depth or package layout, making it easier to relocate resource assets.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {URL} Absolute file URL referencing the bundled artefact.
 */
export declare function resolveBundledResourceUrl(
    resourceName: any
): import("url").URL;
/**
 * Resolve a filesystem path for a bundled resource artefact.
 *
 * @param {string} resourceName Name of the resource file to resolve.
 * @returns {string} Local filesystem path for the bundled artefact.
 */
export declare function resolveBundledResourcePath(resourceName: any): string;
