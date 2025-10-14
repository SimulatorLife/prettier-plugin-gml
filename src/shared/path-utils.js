import { isNonEmptyString } from "./string-utils.js";

/**
 * Converts the provided filesystem path to POSIX-style separators so the
 * formatter can perform deterministic comparisons regardless of the host OS.
 * Empty or non-string values deliberately collapse to an empty string because
 * callers often pass through optional config values where "missing" should not
 * be treated as a path.
 *
 * @param {unknown} inputPath Potential path string that may contain Windows
 *                            backslashes.
 * @returns {string} Original path with every run of backslashes replaced by a
 *                   forward slash, or an empty string when the input was not a
 *                   non-empty string.
 */
export function toPosixPath(inputPath) {
    if (!isNonEmptyString(inputPath)) {
        return "";
    }

    return inputPath.replace(/\\+/g, "/");
}
