import path from "node:path";

import {
    compactArray,
    createListSplitPattern,
    normalizeExtensionSuffix,
    normalizeStringList,
    uniqueArray
} from "../shared/dependencies.js";

type ExtensionInput =
    | string
    | Iterable<string>
    | Array<string>
    | null
    | undefined;

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

function normalizeExtensionFragments(value: unknown): Array<string> {
    return normalizeStringList(value, NORMALIZE_EXTENSION_LIST_OPTIONS);
}

function coerceExtensionValue(value: unknown): string | null {
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

function isIterable(value: unknown): value is Iterable<unknown> {
    return (
        typeof (value as Iterable<unknown>)?.[Symbol.iterator] === "function"
    );
}

function collectExtensionCandidates(
    rawExtensions: ExtensionInput
): Array<string> {
    if (typeof rawExtensions === "string") {
        return normalizeExtensionFragments(rawExtensions);
    }

    if (
        rawExtensions &&
        typeof rawExtensions !== "string" &&
        isIterable(rawExtensions)
    ) {
        const fragments: Array<string> = [];

        for (const candidate of rawExtensions) {
            if (typeof candidate === "string") {
                fragments.push(...normalizeExtensionFragments(candidate));
            }
        }

        return fragments;
    }

    return normalizeExtensionFragments(rawExtensions);
}

export function normalizeExtensions(
    rawExtensions: ExtensionInput,
    fallbackExtensions: Array<string> = []
): Array<string> {
    const candidates = collectExtensionCandidates(rawExtensions);
    const coercedValues = candidates.map((candidate) =>
        coerceExtensionValue(candidate)
    );
    const filteredValues = compactArray(coercedValues);
    const normalized = uniqueArray(Array.from(filteredValues));

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

export { EXTENSION_LIST_SPLIT_PATTERN };
