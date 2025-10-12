import { constants as fsConstants } from "node:fs";

export const COLLISION_CONFLICT_CODE = "collision";
export const PRESERVE_CONFLICT_CODE = "preserve";
export const IGNORE_CONFLICT_CODE = "ignored";
export const RESERVED_CONFLICT_CODE = "reserved";

export function escapeForRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createPatternRegExp(pattern) {
    if (typeof pattern !== "string" || pattern.length === 0) {
        return null;
    }

    const escaped = escapeForRegExp(pattern.trim());
    if (!escaped) {
        return null;
    }

    const wildcardExpanded = escaped
        .replace(/\\\*/g, ".*")
        .replace(/\\\?/g, ".");

    return new RegExp(`^${wildcardExpanded}$`, "i");
}

export function buildPatternMatchers(patterns) {
    const matchers = [];

    for (const pattern of patterns ?? []) {
        const regexp = createPatternRegExp(pattern);
        if (!regexp) {
            continue;
        }

        matchers.push({ raw: pattern, regexp });
    }

    return matchers;
}

export function matchesIgnorePattern(matchers, identifierName, filePath) {
    if (!Array.isArray(matchers) || matchers.length === 0) {
        return null;
    }

    const name = identifierName ?? "";
    const file = filePath ?? "";

    for (const matcher of matchers) {
        if (matcher.regexp.test(name) || matcher.regexp.test(file)) {
            return matcher.raw;
        }
    }

    return null;
}

export function createConflict({
    code,
    severity,
    message,
    scope,
    identifier,
    suggestions = [],
    details = null
}) {
    return {
        code,
        severity,
        message,
        scope,
        identifier,
        suggestions,
        details
    };
}

function resolveFileOccurrenceKey(filePath, fallbackPath) {
    if (typeof filePath === "string" && filePath.length > 0) {
        return filePath;
    }

    if (typeof fallbackPath === "string" && fallbackPath.length > 0) {
        return fallbackPath;
    }

    if (fallbackPath === null) {
        return null;
    }

    return "<unknown>";
}

export function incrementFileOccurrence(counts, filePath, fallbackPath) {
    const key = resolveFileOccurrenceKey(filePath, fallbackPath);
    if (key === null) {
        return false;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
    return true;
}

export function summarizeFileOccurrences(counts) {
    return Array.from(counts.entries()).map(([filePath, occurrences]) => ({
        filePath,
        occurrences
    }));
}

export const DEFAULT_WRITE_ACCESS_MODE =
    typeof fsConstants?.W_OK === "number" ? fsConstants.W_OK : undefined;
