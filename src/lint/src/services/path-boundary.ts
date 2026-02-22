import { Core } from "@gml-modules/core";

/**
 * Split a file-system path into its individual directory/file segments,
 * stripping any leading, trailing, or consecutive separators.
 *
 * Accepts both POSIX `/` and Windows `\` separators so the function is safe
 * to call on paths from either platform.
 */
function splitPathSegments(pathValue: string): Array<string> {
    return pathValue
        .split(/[\\/]+/u)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
}

/**
 * Determine whether a normalized file path should be excluded from project
 * analysis based on a set of segment-level directory exclusions and an
 * optional list of allowed override directories.
 *
 * A path is **not** excluded when it falls inside any directory listed in
 * `allowedDirectories` (determined via {@link Core.isPathWithinBoundary}).
 * Otherwise, the path is excluded when any of its segments (case-folded)
 * match an entry in `excludedDirectories`.
 *
 * @param normalizedFilePath Pre-normalized absolute file path.
 * @param excludedDirectories Lower-cased segment names to treat as excluded.
 * @param allowedDirectories Absolute paths that override the exclusion rule.
 */
export function isDirectoryExcludedBySegments(
    normalizedFilePath: string,
    excludedDirectories: ReadonlySet<string>,
    allowedDirectories: ReadonlyArray<string>
): boolean {
    const isAllowedOverride = allowedDirectories.some((directory) =>
        Core.isPathWithinBoundary(normalizedFilePath, directory)
    );
    if (isAllowedOverride) {
        return false;
    }

    const segments = splitPathSegments(normalizedFilePath);
    return segments.some((segment) => excludedDirectories.has(segment.toLowerCase()));
}
