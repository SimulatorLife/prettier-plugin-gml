import path from "node:path";

import { toArrayFromIterable } from "./array.js";
import { isNonEmptyString } from "./string.js";

const WINDOWS_SEPARATOR_PATTERN = /\\+/g;
const POSIX_SEPARATOR_PATTERN = /\/+/g;

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
export function toPosixPath(inputPath) {
    if (!isNonEmptyString(inputPath)) {
        return "";
    }

    return inputPath.replaceAll(WINDOWS_SEPARATOR_PATTERN, "/");
}

/**
 * Convert a POSIX-style path into the current platform's native separator.
 * Non-string and empty inputs are normalized to an empty string so callers
 * can freely chain additional `path.join` invocations without defensive
 * nullish checks.
 *
 * @param {unknown} inputPath Candidate POSIX path string.
 * @returns {string} Path rewritten using the runtime's path separator.
 */
export function fromPosixPath(inputPath) {
    if (!isNonEmptyString(inputPath)) {
        return "";
    }

    if (path.sep === "/") {
        return inputPath;
    }

    return inputPath.replaceAll(POSIX_SEPARATOR_PATTERN, path.sep);
}

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
export function resolveContainedRelativePath(childPath, parentPath) {
    if (!isNonEmptyString(childPath) || !isNonEmptyString(parentPath)) {
        return null;
    }

    const relative = path.relative(parentPath, childPath);

    if (relative === "") {
        return "";
    }

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return null;
    }

    return relative;
}

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
export function* walkAncestorDirectories(
    startPath,
    { includeSelf = true } = {}
) {
    if (!isNonEmptyString(startPath)) {
        return;
    }

    const visited = new Set();
    let current = path.resolve(startPath);

    if (!includeSelf) {
        current = path.dirname(current);
    }

    while (!visited.has(current)) {
        visited.add(current);
        yield current;

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }

        current = parent;
    }
}

/**
 * Collect the unique ancestor directories for the provided starting
 * directories. Ancestors are returned in the order they were discovered so
 * callers can maintain deterministic search paths when probing for
 * configuration files.
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
 * Checks whether {@link childPath} resides within {@link parentPath} when both
 * paths are resolved to absolute locations. Empty strings short-circuit to
 * `false` so callers can safely pass optional metadata without normalizing
 * first.
 *
 * A relative result of `""` indicates that the paths point to the same
 * directory, which is considered "inside" for consumers that treat the parent
 * as an allowed root.
 *
 * @param {string | undefined | null} childPath Path that may sit beneath
 *                                              {@link parentPath}.
 * @param {string | undefined | null} parentPath Candidate ancestor directory.
 * @returns {boolean} `true` when {@link childPath} resolves to {@link parentPath}
 *                    or a descendant.
 */
export function isPathInside(childPath, parentPath) {
    const relative = resolveContainedRelativePath(childPath, parentPath);
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

/**
 * Resolve high-level metadata about how {@link filePath} relates to
 * {@link projectRoot}. Consolidates the repeated pattern of normalizing input
 * paths, resolving absolute equivalents, and determining whether the file sits
 * within the provided project root.
 *
 * The helper always returns an absolute version of {@link filePath}. When a
 * project root is supplied, callers also receive a relative path (which may
 * include `..` segments when the file lives outside the root) alongside a flag
 * that indicates containment. Normalized metadata keeps downstream consumers in
 * sync while avoiding the drift that previously arose from hand-rolled
 * conditionals spread across the identifier-case planner, resource analysis,
 * and syntax error formatter.
 *
 * @param {string | null | undefined} filePath Candidate file path to
 *        normalize.
 * @param {string | null | undefined} projectRoot Optional project root used
 *        when computing relative paths.
 * @returns {{
 *   absolutePath: string,
 *   hasProjectRoot: boolean,
 *   inputWasAbsolute: boolean,
 *   isInsideProjectRoot: boolean,
 *   projectRoot: string | null,
 *   relativePath: string
 * } | null}
 */
export function resolveProjectPathInfo(filePath, projectRoot) {
    if (!isNonEmptyString(filePath)) {
        return null;
    }

    const absolutePath = path.resolve(filePath);
    const inputWasAbsolute = path.isAbsolute(filePath);

    if (!isNonEmptyString(projectRoot)) {
        return {
            absolutePath,
            hasProjectRoot: false,
            inputWasAbsolute,
            isInsideProjectRoot: false,
            projectRoot: null,
            relativePath: absolutePath
        };
    }

    const absoluteProjectRoot = path.resolve(projectRoot);
    const containedRelative = resolveContainedRelativePath(
        absolutePath,
        absoluteProjectRoot
    );
    const isInsideProjectRoot = containedRelative !== null;

    return {
        absolutePath,
        hasProjectRoot: true,
        inputWasAbsolute,
        isInsideProjectRoot,
        projectRoot: absoluteProjectRoot,
        relativePath: isInsideProjectRoot
            ? containedRelative
            : path.relative(absoluteProjectRoot, absolutePath)
    };
}
