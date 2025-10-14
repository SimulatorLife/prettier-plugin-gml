import path from "node:path";

import { isNonEmptyString } from "./string-utils.js";

const WINDOWS_SEPARATOR_PATTERN = /\\+/g;
const POSIX_SEPARATOR_PATTERN = /\/+/g;

/**
 * Replace any Windows-style backslashes with forward slashes so downstream
 * consumers can rely on a stable, POSIX-style path. Empty and non-string
 * inputs are normalised to an empty string rather than throwing, which
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

    return inputPath.replace(WINDOWS_SEPARATOR_PATTERN, "/");
}

/**
 * Convert a POSIX-style path into the current platform's native separator.
 * Non-string and empty inputs are normalised to an empty string so callers
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

    return inputPath.replace(POSIX_SEPARATOR_PATTERN, path.sep);
}
