import {
    resolveContainedRelativePath,
    collectUniqueAncestorDirectories
} from "./shared-deps.js";

/**
 * Checks whether `child` resides within `parent` when both paths are resolved
 * to absolute locations. Empty strings short-circuit to `false` so callers can
 * safely pass optional metadata without normalizing first.
 *
 * A relative result of `""` indicates that `child` and `parent` point to the
 * same directory, which is considered "inside" for consumers that treat the
 * parent as an allowed root.
 *
 * @param {string | undefined | null} child Path that may sit beneath `parent`.
 * @param {string | undefined | null} parent Candidate ancestor directory.
 * @returns {boolean} `true` when `child` resolves to `parent` or a descendant.
 */
export function isPathInside(child, parent) {
    const relative = resolveContainedRelativePath(child, parent);
    return relative !== null;
}

/**
 * Resolves every directory from the provided start paths up to the file system
 * root, preserving discovery order. Duplicate directories are returned only
 * once even when multiple starting points share ancestors. Empty inputs are
 * ignored, mirroring the truthiness guard in {@link isPathInside}.
 *
 * @param {...(string | undefined | null)} startingDirectories Path(s) whose
 *                                                             ancestor chains
 *                                                             should be
 *                                                             collected.
 * @returns {Array<string>} Flat list of absolute directories, ordered from
 *                          each start path toward the root.
 */
export function collectAncestorDirectories(...startingDirectories) {
    return collectUniqueAncestorDirectories(startingDirectories);
}
