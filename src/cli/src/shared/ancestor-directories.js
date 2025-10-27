import {
    isNonEmptyString,
    toArrayFromIterable,
    walkAncestorDirectories
} from "../dependencies.js";

/**
 * Collect the unique ancestor directories for the provided starting
 * directories. Ancestors are returned in the order they were discovered so
 * callers can maintain deterministic search paths when probing for
 * configuration files.
 *
 * The helper previously lived in the shared path utilities even though the CLI
 * was the only consumer. Co-locating it with the rest of the CLI helpers keeps
 * the shared bundle focused on cross-environment primitives while preserving
 * the behaviour relied upon by the command surface.
 *
 * @param {Iterable<string | null | undefined>} startingDirectories Starting
 *        directories whose ancestors should be collected.
 * @param {{ includeSelf?: boolean }} [options]
 * @returns {Array<string>} Ordered list of unique ancestor directories.
 */
export function collectUniqueAncestorDirectories(
    startingDirectories,
    { includeSelf = true } = {}
) {
    const directories = new Set();
    const entries =
        typeof startingDirectories === "string"
            ? [startingDirectories]
            : toArrayFromIterable(startingDirectories);

    for (const start of entries) {
        if (!isNonEmptyString(start)) {
            continue;
        }

        for (const directory of walkAncestorDirectories(start, {
            includeSelf
        })) {
            directories.add(directory);
        }
    }

    return Array.from(directories);
}

/**
 * Resolves every directory from the provided start paths up to the file system
 * root, preserving discovery order. Duplicate directories are returned only
 * once even when multiple starting points share ancestors. Empty inputs are
 * ignored, mirroring the truthiness guard in {@link collectUniqueAncestorDirectories}.
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
