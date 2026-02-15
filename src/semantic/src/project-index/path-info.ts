import path from "node:path";

import { Core } from "@gml-modules/core";

const PARENT_SEGMENT_PATTERN = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

/**
 * Detect if a path is a Windows-style path.
 *
 * Returns true if the path contains:
 * - A drive letter (e.g., C:\ or C:/)
 * - UNC notation (e.g., \\server\share)
 * - Backslashes (Windows path separator)
 *
 * This avoids incorrectly treating POSIX absolute paths (e.g., /tmp/foo)
 * as Windows paths, which would happen if we only used path.win32.isAbsolute().
 */
function isWin32Path(candidate: string | null | undefined): boolean {
    if (!Core.isNonEmptyString(candidate)) {
        return false;
    }

    // Check for drive letter (e.g., C:\ or C:/)
    if (/^[a-zA-Z]:/.test(candidate)) {
        return true;
    }

    // Check for UNC path (e.g., \\server\share)
    if (/^\\\\[^\\]/.test(candidate)) {
        return true;
    }

    // Check for backslashes (Windows path separator)
    if (candidate.includes("\\")) {
        return true;
    }

    return false;
}

function resolveContainedRelativePathWithPath(
    pathApi: typeof path,
    childPath: string,
    parentPath: string
): string | null {
    const relative = pathApi.relative(parentPath, childPath);

    if (relative === "") {
        return "";
    }

    if (PARENT_SEGMENT_PATTERN.test(relative) || pathApi.isAbsolute(relative)) {
        return null;
    }

    return relative;
}

/**
 * Resolve high-level metadata about how {@link filePath} relates to
 * {@link projectRoot}.
 *
 * The helper is specific to the project index and identifier-case workflows,
 * normalizing absolute/relative paths alongside containment checks. Keeping it
 * within the project-index module avoids leaking formatter-specific semantics
 * into the shared path utilities.
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
export function resolveProjectPathInfo(filePath, projectRoot?: string | null) {
    if (!Core.isNonEmptyString(filePath)) {
        return null;
    }

    const useWin32 = isWin32Path(filePath) || isWin32Path(projectRoot);
    const pathApi = useWin32 ? path.win32 : path;

    const absolutePath = pathApi.resolve(filePath);
    const inputWasAbsolute = pathApi.isAbsolute(filePath);

    if (!Core.isNonEmptyString(projectRoot)) {
        return {
            absolutePath,
            hasProjectRoot: false,
            inputWasAbsolute,
            isInsideProjectRoot: false,
            projectRoot: null,
            relativePath: absolutePath
        };
    }

    const absoluteProjectRoot = pathApi.resolve(projectRoot);
    const containedRelative = resolveContainedRelativePathWithPath(pathApi, absolutePath, absoluteProjectRoot);
    const isInsideProjectRoot = containedRelative !== null;

    return {
        absolutePath,
        hasProjectRoot: true,
        inputWasAbsolute,
        isInsideProjectRoot,
        projectRoot: absoluteProjectRoot,
        relativePath: isInsideProjectRoot ? containedRelative : pathApi.relative(absoluteProjectRoot, absolutePath)
    };
}
