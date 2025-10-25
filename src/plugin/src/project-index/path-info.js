import path from "node:path";

import { isNonEmptyString } from "../shared/string-utils.js";
import { resolveContainedRelativePath } from "../shared/path-utils.js";

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
