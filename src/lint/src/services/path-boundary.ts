import { realpathSync } from "node:fs";

const WINDOWS_DRIVE_LETTER_PATTERN = /^[A-Za-z]:/;
const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:\\$/;
const WINDOWS_DRIVE_ROOT_WITH_OPTIONAL_SEPARATOR_PATTERN = /^(?:[A-Za-z]:)\\?$/;
const UNC_PREFIX_PATTERN = /^\\\\/;
const UNC_SHARE_ROOT_PATTERN = /^\\\\[^\\]+\\[^\\]+$/;
const UNC_SHARE_ROOT_WITH_TRAILING_SEPARATOR_PATTERN = /^\\\\[^\\]+\\[^\\]+\\$/;

function isWindowsLikePath(value: string): boolean {
    return WINDOWS_DRIVE_LETTER_PATTERN.test(value) || UNC_PREFIX_PATTERN.test(value);
}

function normalizeSeparators(value: string): string {
    if (isWindowsLikePath(value)) {
        return value.replaceAll("/", "\\");
    }

    return value.replaceAll("\\", "/");
}

function isCanonicalRoot(value: string): boolean {
    if (value === "/") {
        return true;
    }

    if (WINDOWS_DRIVE_ROOT_PATTERN.test(value)) {
        return true;
    }

    return UNC_SHARE_ROOT_PATTERN.test(value);
}

function normalizeWindowsRootShape(value: string): string {
    if (WINDOWS_DRIVE_ROOT_WITH_OPTIONAL_SEPARATOR_PATTERN.test(value)) {
        return `${value.slice(0, 2)}\\`;
    }

    if (UNC_SHARE_ROOT_WITH_TRAILING_SEPARATOR_PATTERN.test(value)) {
        return value.slice(0, -1);
    }

    return value;
}

function trimTrailingSeparators(value: string): string {
    const normalizedRoot = normalizeWindowsRootShape(value);
    if (isCanonicalRoot(normalizedRoot)) {
        return normalizedRoot;
    }

    let current = value;
    while (current.endsWith("/") || current.endsWith("\\")) {
        current = current.slice(0, -1);
    }

    return normalizeWindowsRootShape(current);
}

function canonicalizePathCase(value: string): string {
    if (isWindowsLikePath(value)) {
        return value.toLowerCase();
    }

    return value;
}

function canonicalizeFromString(value: string): string {
    const withNormalizedSeparators = normalizeSeparators(value);
    const trimmed = trimTrailingSeparators(withNormalizedSeparators);
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
