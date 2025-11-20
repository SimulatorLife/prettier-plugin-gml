/**
 * Normalize a raw resource path into a POSIX-style path relative to the
 * current project root when available.
 *
 * @param {string | null | undefined} rawPath Path provided by the caller.
 * @param {{ projectRoot?: string | null }} [options]
 * @returns {string | null} Normalized resource path or `null` when the input is
 *          empty or outside the project tree.
 */
export declare function normalizeProjectResourcePath(rawPath: any, { projectRoot }?: {}): any;
/**
 * Resolve the path to {@link absoluteFilePath} relative to {@link projectRoot}
 * when the file resides inside the project directory tree.
 *
 * @param {string | null | undefined} projectRoot Root directory of the project.
 * @param {string | null | undefined} absoluteFilePath Absolute file path to
 *        normalize.
 * @returns {string | null} POSIX path relative to {@link projectRoot}, or the
 *          normalized absolute path when no relationship exists.
 */
export declare function resolveProjectRelativeFilePath(projectRoot: any, absoluteFilePath: any): any;
/**
 * Format {@link filePath} for display within logs or diagnostics, collapsing
 * the path to a project-relative string when the file sits inside
 * {@link projectRoot}.
 *
 * @param {string | null | undefined} filePath Candidate path to display.
 * @param {string | null | undefined} projectRoot Root directory of the project
 *        used for relative resolution.
 * @returns {string | null} Display-friendly path or `null` when the input is
 *          missing.
 */
export declare function resolveProjectDisplayPath(filePath: any, projectRoot: any): any;
