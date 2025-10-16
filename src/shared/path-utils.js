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
function toPosixPath(inputPath) {
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
function fromPosixPath(inputPath) {
    if (!isNonEmptyString(inputPath)) {
        return "";
    }

    if (path.sep === "/") {
        return inputPath;
    }

    return inputPath.replaceAll(POSIX_SEPARATOR_PATTERN, path.sep);
}

function isPathInside(child, parent) {
    if (!child || !parent) {
        return false;
    }

    const relative = path.relative(parent, child);
    if (!relative) {
        return true;
    }

    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function collectAncestorDirectories(...startingDirectories) {
    const seen = new Set();
    const result = [];

    for (const start of startingDirectories) {
        if (!start) {
            continue;
        }

        let current = path.resolve(start);

        while (!seen.has(current)) {
            seen.add(current);
            result.push(current);

            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }

            current = parent;
        }
    }

    return result;
}

export { toPosixPath, fromPosixPath, isPathInside, collectAncestorDirectories };
