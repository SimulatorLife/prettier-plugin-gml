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
export declare function resolveProjectPathInfo(filePath: any, projectRoot: any): {
    absolutePath: any;
    hasProjectRoot: boolean;
    inputWasAbsolute: any;
    isInsideProjectRoot: boolean;
    projectRoot: any;
    relativePath: any;
};
