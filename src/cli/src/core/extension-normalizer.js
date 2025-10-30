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

function collectExtensionCandidates(rawExtensions) {
    if (Array.isArray(rawExtensions)) {
        return rawExtensions
            .filter((candidate) => typeof candidate === "string")
            .flatMap((candidate) =>
                normalizeStringList(candidate, {
                    splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
                    allowInvalidType: true
                })
            );
    }

    return normalizeStringList(rawExtensions, {
        splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
        allowInvalidType: true
    });
}

export function normalizeExtensions(rawExtensions, fallbackExtensions = []) {
    const candidates = collectExtensionCandidates(rawExtensions);
    const coercedValues = candidates.map(coerceExtensionValue);
    const filteredValues = compactArray(coercedValues);
    const normalized = uniqueArray(filteredValues);

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

export { EXTENSION_LIST_SPLIT_PATTERN };
