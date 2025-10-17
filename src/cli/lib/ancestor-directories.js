import path from "node:path";

/**
 * Resolve every directory from the provided start paths up to the file system
 * root, preserving discovery order. Duplicate directories are returned only
 * once even when multiple starting points share ancestors. Empty inputs are
 * ignored, mirroring the truthiness guard used by higher-level path helpers
 * inside the CLI.
 *
 * @param {...(string | undefined | null)} startingDirectories Path(s) whose
 *                                                             ancestor chains
 *                                                             should be
 *                                                             collected.
 * @returns {Array<string>} Flat list of absolute directories, ordered from
 *                          each start path toward the root.
 */
export function collectAncestorDirectories(...startingDirectories) {
    const seen = new Set();
    const result = [];

    for (const start of startingDirectories) {
        if (!start) {
            continue;
        }

        let current = path.resolve(start);

        while (!seen.has(current)) {
            seen.add(current);
            result.push(current);

            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }

            current = parent;
        }
    }

    return result;
}
