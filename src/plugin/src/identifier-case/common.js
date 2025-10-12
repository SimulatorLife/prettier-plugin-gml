import { constants as fsConstants } from "node:fs";

export const COLLISION_CONFLICT_CODE = "collision";
export const PRESERVE_CONFLICT_CODE = "preserve";
export const IGNORE_CONFLICT_CODE = "ignored";

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
    suggestions = []
}) {
    return {
        code,
        severity,
        message,
        scope,
        identifier,
        suggestions
    };
}

export const DEFAULT_WRITE_ACCESS_MODE =
    typeof fsConstants?.W_OK === "number" ? fsConstants.W_OK : undefined;
