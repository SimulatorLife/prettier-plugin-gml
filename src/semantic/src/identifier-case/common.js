import { constants as fsConstants } from "node:fs";

import {
    escapeRegExp,
    incrementMapValue,
    isNonEmptyArray,
    isNonEmptyString
} from "./dependencies.js";

export const COLLISION_CONFLICT_CODE = "collision";
export const PRESERVE_CONFLICT_CODE = "preserve";
export const IGNORE_CONFLICT_CODE = "ignored";
export const RESERVED_CONFLICT_CODE = "reserved";

export function formatConfigurationConflictMessage({
    configConflict,
    identifierName,
    noun = "Identifier"
}) {
    if (!configConflict) {
        return null;
    }

    const labelNoun = isNonEmptyString(noun) ? noun : "Identifier";
    const labelName =
        typeof identifierName === "string"
            ? identifierName
            : String(identifierName ?? "");
    const subject = `${labelNoun} '${labelName}'`;

    if (configConflict.code === PRESERVE_CONFLICT_CODE) {
        return `${subject} is preserved by configuration.`;
    }

    if (configConflict.code === IGNORE_CONFLICT_CODE) {
        const ignoreMatch = isNonEmptyString(configConflict.ignoreMatch)
            ? ` matches ignore pattern '${configConflict.ignoreMatch}'.`
            : " is ignored by configuration.";
        return `${subject}${ignoreMatch}`;
    }

    return `${subject} cannot be renamed due to configuration.`;
}

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

    incrementMapValue(counts, key);
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
