import path from "node:path";

import {
    compactArray,
    createListSplitPattern,
    normalizeExtensionSuffix,
    normalizeStringList,
    uniqueArray
} from "../shared/dependencies.js";

const EXTENSION_LIST_SPLIT_PATTERN = createListSplitPattern(
    compactArray([",", path.delimiter]),
    {
        includeWhitespace: true
    }
);

const NORMALIZE_EXTENSION_LIST_OPTIONS = Object.freeze({
    splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
    allowInvalidType: true
});

function normalizeExtensionFragments(value) {
    return normalizeStringList(value, NORMALIZE_EXTENSION_LIST_OPTIONS);
}

function coerceExtensionValue(value) {
    if (typeof value !== "string") {
        return null;
    }

    const cleaned = value
        .toLowerCase()
        .replace(/.*[\\/]/, "")
        .replace(/^[*?]+/, "");

    if (!cleaned) {
        return null;
    }

    return normalizeExtensionSuffix(cleaned);
}

function collectExtensionCandidates(rawExtensions) {
    if (typeof rawExtensions === "string") {
        return normalizeExtensionFragments(rawExtensions);
    }

    if (
        rawExtensions &&
        typeof rawExtensions !== "string" &&
        typeof rawExtensions[Symbol.iterator] === "function"
    ) {
        const fragments = [];

        for (const candidate of rawExtensions) {
            if (typeof candidate === "string") {
                fragments.push(...normalizeExtensionFragments(candidate));
            }
        }

        return fragments;
    }

    return normalizeExtensionFragments(rawExtensions);
}

export function normalizeExtensions(rawExtensions, fallbackExtensions = []) {
    const candidates = collectExtensionCandidates(rawExtensions);
    const coercedValues = candidates.map((candidate) =>
        coerceExtensionValue(candidate)
    );
    const filteredValues = compactArray(coercedValues);
    const normalized = uniqueArray(filteredValues);

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

export { EXTENSION_LIST_SPLIT_PATTERN };
