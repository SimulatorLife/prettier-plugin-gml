import { constants as fsConstants } from "node:fs";

import { isNonEmptyArray } from "../../../shared/array-utils.js";
import { escapeRegExp } from "../../../shared/regexp.js";
import { isNonEmptyString } from "../../../shared/string-utils.js";

export const COLLISION_CONFLICT_CODE = "collision";
export const PRESERVE_CONFLICT_CODE = "preserve";
export const IGNORE_CONFLICT_CODE = "ignored";
export const RESERVED_CONFLICT_CODE = "reserved";

export function escapeForRegExp(value) {
    if (typeof value !== "string") {
        throw new TypeError("Value must be a string");
    }

    return escapeRegExp(value);
}

export function createPatternRegExp(pattern) {
    if (!isNonEmptyString(pattern)) {
        return null;
    }

    const escaped = escapeForRegExp(pattern.trim());
    if (!escaped) {
        return null;
    }

    const wildcardExpanded = escaped
        .replaceAll(String.raw`\*`, ".*")
        .replaceAll(String.raw`\?`, ".");

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
    if (!isNonEmptyArray(matchers)) {
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

export function resolveIdentifierConfigurationConflict({
    preservedSet,
    identifierName,
    ignoreMatchers,
    filePath
}) {
    if (
        identifierName != undefined &&
        typeof preservedSet?.has === "function" &&
        preservedSet.has(identifierName)
    ) {
        return {
            code: PRESERVE_CONFLICT_CODE,
            reason: "preserve"
        };
    }

    const ignoreMatch = matchesIgnorePattern(
        ignoreMatchers,
        identifierName,
        filePath
    );

    if (ignoreMatch) {
        return {
            code: IGNORE_CONFLICT_CODE,
            reason: "ignore",
            ignoreMatch
        };
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
    if (isNonEmptyString(filePath)) {
        return filePath;
    }

    if (isNonEmptyString(fallbackPath)) {
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

export function summarizeReferenceFileOccurrences(
    references,
    { fallbackPath = null, includeFilePaths = [] } = {}
) {
    const counts = new Map();

    for (const extraPath of includeFilePaths ?? []) {
        if (typeof extraPath !== "string" || extraPath.length === 0) {
            continue;
        }

        incrementFileOccurrence(counts, extraPath);
    }

    for (const reference of references ?? []) {
        const filePath = reference?.filePath;
        incrementFileOccurrence(counts, filePath, fallbackPath);
    }

    return summarizeFileOccurrences(counts);
}

export function summarizeFileOccurrences(counts) {
    return [...counts.entries()].map(([filePath, occurrences]) => ({
        filePath,
        occurrences
    }));
}

export const DEFAULT_WRITE_ACCESS_MODE =
    typeof fsConstants?.W_OK === "number" ? fsConstants.W_OK : undefined;
