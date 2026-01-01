import path from "node:path";

import { Core } from "@gml-modules/core";

const {
    compactArray,
    createListSplitPattern,
    normalizeExtensionSuffix,
    normalizeStringList,
    uniqueArray
} = Core;

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

export function normalizeExtensions(
    rawExtensions: ExtensionInput,
    fallbackExtensions: ReadonlyArray<string> = []
): Array<string> {
    const fragments: Array<string> = [];
    const splitOptions = {
        splitPattern: EXTENSION_LIST_SPLIT_PATTERN,
        allowInvalidType: true
    } as const;

    if (typeof rawExtensions === "string") {
        fragments.push(
            ...(normalizeStringList(
                rawExtensions,
                splitOptions
            ) as Array<string>)
        );
    } else if (rawExtensions?.[Symbol.iterator]) {
        for (const candidate of rawExtensions) {
            if (typeof candidate === "string") {
                fragments.push(
                    ...(normalizeStringList(
                        candidate,
                        splitOptions
                    ) as Array<string>)
                );
            }
        }
    } else {
        fragments.push(
            ...(normalizeStringList(
                rawExtensions,
                splitOptions
            ) as Array<string>)
        );
    }

    const coerced = fragments.map((fragment) => coerceExtensionValue(fragment));
    const normalized = uniqueArray(compactArray(coerced), {
        freeze: false
    }) as Array<string>;

    return normalized.length > 0 ? normalized : fallbackExtensions.map(String);
}

export { EXTENSION_LIST_SPLIT_PATTERN };
