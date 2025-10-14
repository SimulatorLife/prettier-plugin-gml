import { isNonEmptyString } from "../../../shared/string-utils.js";

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

    return inputPath.replace(/\\+/g, "/");
}
