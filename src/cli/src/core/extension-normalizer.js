import path from "node:path";

import {
    compactArray,
    createListSplitPattern,
    normalizeStringList,
    uniqueArray
} from "../shared/dependencies.js";

const EXTENSION_LIST_SPLIT_PATTERN = createListSplitPattern(
    compactArray([",", path.delimiter]),
    {
        includeWhitespace: true
    }
);

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

    return cleaned.startsWith(".") ? cleaned : `.${cleaned}`;
}

function flattenExtensionCandidates(rawExtensions) {
    const initialCandidates = Array.isArray(rawExtensions)
        ? rawExtensions
        : normalizeStringList(rawExtensions, {
              splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
              allowInvalidType: true
          });

    const flattened = [];

    for (const candidate of initialCandidates) {
        if (typeof candidate !== "string") {
            continue;
        }

        const segments = normalizeStringList(candidate, {
            splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
            allowInvalidType: true
        });

        if (segments.length === 0) {
            continue;
        }

        flattened.push(...segments);
    }

    return flattened;
}

export function normalizeExtensions(rawExtensions, fallbackExtensions = []) {
    const candidates = flattenExtensionCandidates(rawExtensions);
    const coercedValues = candidates.map(coerceExtensionValue);
    const filteredValues = compactArray(coercedValues);
    const normalized = uniqueArray(filteredValues);

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

export { EXTENSION_LIST_SPLIT_PATTERN };
