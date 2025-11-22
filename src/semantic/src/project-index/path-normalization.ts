import path from "node:path";

import { Core } from "@gml-modules/core";

import { resolveProjectPathInfo } from "./path-info.js";

/** @typedef {NonNullable<ReturnType<typeof resolveProjectPathInfo>>} ProjectPathInfo */

/**
 * Resolve metadata for {@link filePath} relative to {@link projectRoot} and
 * forward it to {@link projector}. Centralizing this wrapper keeps the guard
 * logic consistent across the normalization helpers below so each exported
 * function can focus on its specific return value shape.
 *
 * @template TResult
 * @param {string | null | undefined} filePath Absolute or project-relative path
 *        being normalized.
 * @param {string | null | undefined} projectRoot Root directory of the
 *        GameMaker project.
 * @param {(info: ProjectPathInfo) => TResult}
 *        projector Callback that derives the final value from the resolved
 *        metadata.
 * @returns {TResult | null} Result of {@link projector} when path resolution
 *          succeeds; otherwise `null` when the path falls outside the project.
 */
function withProjectPathInfo(filePath, projectRoot, projector) {
    Core.assertFunction(projector, "projector");

    const info = resolveProjectPathInfo(filePath, projectRoot);
    if (!info) {
        return null;
    }

    return projector(info);
}

/**
 * Normalize a raw resource path into a POSIX-style path relative to the
 * current project root when available.
 *
 * @param {string | null | undefined} rawPath Path provided by the caller.
 * @param {{ projectRoot?: string | null }} [options]
 * @returns {string | null} Normalized resource path or `null` when the input is
 *          empty or outside the project tree.
 */
export function normalizeProjectResourcePath(
    rawPath,
    { projectRoot }: any = {}
) {
    if (!Core.isNonEmptyString(rawPath)) {
        return null;
    }

    const normalized = Core.toPosixPath(rawPath).replace(/^\.\//, "");
    if (!projectRoot) {
        return normalized;
    }

    const absoluteCandidate = path.isAbsolute(normalized)
        ? normalized
        : path.join(projectRoot, normalized);

    return withProjectPathInfo(absoluteCandidate, projectRoot, (info) =>
        Core.toPosixPath(info.relativePath)
    );
}

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
export function resolveProjectRelativeFilePath(projectRoot, absoluteFilePath) {
    return withProjectPathInfo(absoluteFilePath, projectRoot, (info) =>
        Core.toPosixPath(
            info.hasProjectRoot ? info.relativePath : info.absolutePath
        )
    );
}

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
export function resolveProjectDisplayPath(filePath, projectRoot) {
    const normalizedFilePath = Core.getNonEmptyString(filePath);
    if (!normalizedFilePath) {
        return null;
    }

    return withProjectPathInfo(normalizedFilePath, projectRoot, (info) => {
        if (
            !info.inputWasAbsolute ||
            !info.hasProjectRoot ||
            !info.isInsideProjectRoot
        ) {
            return normalizedFilePath;
        }

        return info.relativePath || normalizedFilePath;
    });
}
