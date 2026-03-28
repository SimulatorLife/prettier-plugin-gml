import path from "node:path";

import { Core } from "@gmloop/core";

/**
 * Resolve a user-provided project path to an absolute path.
 * Relative paths are interpreted as being rooted at `projectRoot`.
 *
 * @param projectRoot - Project root used to resolve relative entries.
 * @param inputPath - Absolute or relative path.
 * @returns Absolute normalized path.
 */
export function resolveProjectPath(projectRoot: string, inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath);
}

/**
 * Check whether a target path is selected by allow/deny path lists.
 *
 * Rules:
 * - Empty allow list means "allow everything".
 * - A path is allowed when it exactly matches an allow entry or is inside it.
 * - A denied path always wins over allow matches.
 *
 * @param projectRoot - Root path used to resolve relative entries.
 * @param targetPath - Path being checked.
 * @param allowedPaths - Optional allow list.
 * @param deniedPaths - Optional deny list.
 * @returns True when the path is selected by the allow/deny rules.
 */
export function isPathSelectedByLists(
    projectRoot: string,
    targetPath: string,
    allowedPaths: ReadonlyArray<string>,
    deniedPaths: ReadonlyArray<string>
): boolean {
    const absoluteTargetPath = resolveProjectPath(projectRoot, targetPath);
    const isInsidePathSelection = (selectionPath: string): boolean => {
        const absoluteSelectionPath = resolveProjectPath(projectRoot, selectionPath);
        return (
            absoluteTargetPath === absoluteSelectionPath || Core.isPathInside(absoluteTargetPath, absoluteSelectionPath)
        );
    };

    const isAllowed =
        allowedPaths.length === 0 || allowedPaths.some((selectionPath) => isInsidePathSelection(selectionPath));
    if (!isAllowed) {
        return false;
    }

    return !deniedPaths.some((selectionPath) => isInsidePathSelection(selectionPath));
}
