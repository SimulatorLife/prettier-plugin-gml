// TODO: This should be moved into the Core workspace's path utilities

import { realpathSync } from "node:fs";

import { Core } from "@gml-modules/core";

const WINDOWS_DRIVE_LETTER_PATTERN = /^[A-Za-z]:/;
const UNC_PREFIX_PATTERN = /^\\\\/;

function isWindowsLikePath(value: string): boolean {
    return WINDOWS_DRIVE_LETTER_PATTERN.test(value) || UNC_PREFIX_PATTERN.test(value);
}

function normalizeSeparators(value: string): string {
    if (isWindowsLikePath(value)) {
        return value.replaceAll("/", "\\");
    }

    return value.replaceAll("\\", "/");
}

function canonicalizePathCase(value: string): string {
    if (isWindowsLikePath(value)) {
        return value.toLowerCase();
    }

    return value;
}

function canonicalizeFromString(value: string): string {
    const withNormalizedSeparators = normalizeSeparators(value);
    const trimmed = Core.trimTrailingSeparators(withNormalizedSeparators);
    return canonicalizePathCase(trimmed);
}

/**
 * Canonicalize a path for project-boundary comparisons.
 */
export function normalizeBoundaryPath(pathValue: string): string {
    try {
        return canonicalizeFromString(realpathSync.native(pathValue));
    } catch {
        return canonicalizeFromString(pathValue);
    }
}

function pathSeparatorFor(pathValue: string): string {
    return isWindowsLikePath(pathValue) ? "\\" : "/";
}

/**
 * Compare canonicalized paths using path-segment boundaries.
 */
export function isPathWithinBoundary(filePath: string, rootPath: string): boolean {
    const normalizedRoot = normalizeBoundaryPath(rootPath);
    const normalizedFile = normalizeBoundaryPath(filePath);

    if (normalizedRoot.length === 0 || normalizedFile.length === 0) {
        return false;
    }

    if (normalizedRoot === normalizedFile) {
        return true;
    }

    const separator = pathSeparatorFor(normalizedRoot);
    const withBoundary = normalizedRoot.endsWith(separator) ? normalizedRoot : `${normalizedRoot}${separator}`;
    return normalizedFile.startsWith(withBoundary);
}
