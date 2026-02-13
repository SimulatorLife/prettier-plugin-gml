const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:\\$/;
const WINDOWS_DRIVE_PREFIX_PATTERN = /^[A-Za-z]:[\\/]/;
const UNC_ROOT_PATTERN = /^\\\\[^\\]+\\[^\\]+\\$/;

function isWindowsLikePath(value: string): boolean {
    return WINDOWS_DRIVE_PREFIX_PATTERN.test(value) || value.startsWith("\\\\");
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

    return UNC_ROOT_PATTERN.test(value);
}

function trimTrailingSeparators(value: string): string {
    if (isCanonicalRoot(value)) {
        return value;
    }

    let current = value;
    while (current.endsWith("/") || current.endsWith("\\")) {
        current = current.slice(0, -1);
    }

    return current;
}

function normalizeForBoundaryComparison(value: string): string {
    const withNormalizedSeparators = normalizeSeparators(value);
    const trimmed = trimTrailingSeparators(withNormalizedSeparators);

    if (isWindowsLikePath(trimmed)) {
        return trimmed.toLowerCase();
    }

    return trimmed;
}

function pathSeparatorFor(root: string): string {
    return isWindowsLikePath(root) ? "\\" : "/";
}

/**
 * Compare canonicalized paths using path-segment boundaries.
 */
export function isPathWithinBoundary(filePath: string, rootPath: string): boolean {
    const normalizedRoot = normalizeForBoundaryComparison(rootPath);
    const normalizedFile = normalizeForBoundaryComparison(filePath);

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
