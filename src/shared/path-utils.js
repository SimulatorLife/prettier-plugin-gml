import path from "node:path";

import { isNonEmptyString } from "./string-utils.js";

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
 * Checks whether `child` resides within `parent` when both paths are resolved
 * to absolute locations. Empty strings short-circuit to `false` so callers can
 * safely pass optional metadata without normalizing first.
 *
 * A relative result of `""` indicates that `child` and `parent` point to the
 * same directory, which is considered "inside" for consumers that treat the
 * parent as an allowed root.
 *
 * @param {string | undefined | null} child Path that may sit beneath `parent`.
 * @param {string | undefined | null} parent Candidate ancestor directory.
 * @returns {boolean} `true` when `child` resolves to `parent` or a descendant.
 */
export function isPathInside(child, parent) {
    if (!child || !parent) {
        return false;
    }

    const relative = path.relative(parent, child);
    if (!relative) {
        return true;
    }

    return !relative.startsWith("..") && !path.isAbsolute(relative);
}
