import { isNonEmptyString } from "../utils/string.js";
import { toArrayFromIterable } from "../utils/array.js";
import { walkAncestorDirectories } from "./path.js";

/**
 * Collect the unique ancestor directories for the provided starting
 * directories. Ancestors are returned in the order they were discovered so
 * callers can maintain deterministic search paths when probing for
 * configuration files.
 *
 * The helper previously lived under the CLI package even though it only
 * depends on shared path and string utilities. Housing it alongside the rest
 * of the shared filesystem helpers keeps related traversal logic together and
 * allows other packages to consume it without pulling in CLI-specific
 * dependencies.
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
 *        ancestor chains should be collected.
 * @returns {Array<string>} Flat list of absolute directories, ordered from each
 *        start path toward the root.
 */
export function collectAncestorDirectories(...startingDirectories) {
    return collectUniqueAncestorDirectories(startingDirectories);
}
