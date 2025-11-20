/**
 * Replace any Windows-style backslashes with forward slashes so downstream
 * consumers can rely on a stable, POSIX-style path. Empty and non-string
 * inputs are normalized to an empty string rather than throwing, which
 * mirrors how parser utilities treat optional path metadata.
 *
 * @param {unknown} inputPath Candidate file system path.
 * @returns {string} Normalized POSIX path string, or an empty string when the
 *                   input is missing/invalid.
 */
export declare function toPosixPath(inputPath: any): any;
/**
 * Convert a POSIX-style path into the current platform's native separator.
 * Non-string and empty inputs are normalized to an empty string so callers
 * can freely chain additional `path.join` invocations without defensive
 * nullish checks.
 *
 * @param {unknown} inputPath Candidate POSIX path string.
 * @returns {string} Path rewritten using the runtime's path separator.
 */
export declare function fromPosixPath(inputPath: any): any;
/**
 * Resolve the relative path from {@link parentPath} to {@link childPath} when
 * the child resides within the parent directory tree.
 *
 * Empty strings and non-string inputs short-circuit to `null` so callers can
 * guard against optional metadata without additional checks. The helper mirrors
 * the guard logic previously inlined across the CLI and project index to keep
 * containment checks consistent and allocation-free on the hot path.
 *
 * @param {string | null | undefined} childPath Candidate descendant path.
 * @param {string | null | undefined} parentPath Candidate ancestor directory.
 * @returns {string | null} Relative path when the child is contained within the
 *                          parent, otherwise `null`.
 */
export declare function resolveContainedRelativePath(
    childPath: any,
    parentPath: any
): any;
/**
 * Yield each ancestor directory for the provided start path, beginning with
 * the resolved start directory and walking toward the file system root.
 *
 * Guards against duplicate directories (for example when symbolic links point
 * back to an already-visited parent) to prevent infinite loops. Non-string and
 * empty inputs exit early so callers can forward optional metadata without
 * normalizing it first.
 *
 * @param {string | null | undefined} startPath Directory whose ancestors should
 *        be visited.
 * @param {{ includeSelf?: boolean }} [options]
 * @param {boolean} [options.includeSelf=true] When `false`, the first yielded
 *        directory will be the parent of `startPath` instead of the directory
 *        itself.
 * @returns {Generator<string, void, void>} Iterator over ancestor directories.
 */
export declare function walkAncestorDirectories(
    startPath: any,
    {
        includeSelf
    }?: {
        includeSelf?: boolean;
    }
): Generator<any, void, unknown>;
export declare function isPathInside(childPath: any, parentPath: any): boolean;
