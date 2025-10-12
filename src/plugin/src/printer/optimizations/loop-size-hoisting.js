// Helpers for detecting and naming cached loop size variables.
// This logic analyzes the AST rather than producing Prettier docs, so it lives
// alongside other printer optimizations instead of the main print pipeline.

import { getIdentifierText } from "../../../../shared/ast-node-helpers.js";
import { getCachedValue } from "../../options/options-cache.js";

const DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES = new Map([
    ["array_length", "len"],
    ["ds_grid_height", "height"],
    ["ds_grid_width", "width"],
    ["ds_list_size", "size"],
    ["ds_map_size", "size"]
]);

const LOOP_SIZE_SUFFIX_CACHE = Symbol.for(
    "prettier-plugin-gml.loopLengthHoistFunctionSuffixes"
);
const loopSizeSuffixCache = new WeakMap();

function getSizeRetrievalFunctionSuffixes(options) {
    return getCachedValue(
        options,
        LOOP_SIZE_SUFFIX_CACHE,
        loopSizeSuffixCache,
        () => {
            const overrides = parseSizeRetrievalFunctionSuffixOverrides(
                options?.loopLengthHoistFunctionSuffixes
            );

            const merged = new Map(DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES);
            for (const [functionName, suffix] of overrides) {
                if (suffix === null) {
                    merged.delete(functionName);
                } else {
                    merged.set(functionName, suffix);
                }
            }

            return merged;
        }
    );
}

function parseSizeRetrievalFunctionSuffixOverrides(rawValue) {
    if (typeof rawValue !== "string") {
        return new Map();
    }

    const overrides = new Map();
    const entries = rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    for (const entry of entries) {
        const [rawName, rawSuffix = ""] = entry.split(/[:=]/);
        const normalizedName = rawName?.trim().toLowerCase();
        if (!normalizedName) {
            continue;
        }

        const trimmedSuffix = rawSuffix.trim();
        if (trimmedSuffix === "-") {
            overrides.set(normalizedName, null);
            continue;
        }

        const normalizedSuffix =
            trimmedSuffix.length > 0 ? trimmedSuffix : "len";
        overrides.set(normalizedName, normalizedSuffix);
    }

    return overrides;
}

function getLoopLengthHoistInfo(
    node,
    sizeFunctionSuffixes = DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES
) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const test = node.test;
    if (!test || test.type !== "BinaryExpression") {
        return null;
    }

    if (!test.operator || !["<", "<="].includes(test.operator)) {
        return null;
    }

    const callExpression = test.right;
    if (!callExpression || callExpression.type !== "CallExpression") {
        return null;
    }

    const callee = callExpression.object;
    if (!callee || callee.type !== "Identifier") {
        return null;
    }

    const functionName = (callee.name || "").toLowerCase();
    const cachedSuffix = sizeFunctionSuffixes.get(functionName);
    if (!cachedSuffix) {
        return null;
    }

    const args = Array.isArray(callExpression.arguments)
        ? callExpression.arguments
        : [];
    if (args.length !== 1) {
        return null;
    }

    const arrayIdentifier = args[0];
    const arrayIdentifierName = getIdentifierText(arrayIdentifier);
    if (!arrayIdentifier || !arrayIdentifierName) {
        return null;
    }

    const iterator = test.left;
    if (!iterator || iterator.type !== "Identifier" || !iterator.name) {
        return null;
    }

    const update = node.update;
    if (!update) {
        return null;
    }

    if (update.type === "IncDecStatement") {
        const argument = update.argument;
        if (
            !argument ||
            argument.type !== "Identifier" ||
            argument.name !== iterator.name
        ) {
            return null;
        }
    } else if (update.type === "AssignmentExpression") {
        const left = update.left;
        if (
            !left ||
            left.type !== "Identifier" ||
            left.name !== iterator.name
        ) {
            return null;
        }

        const operator = update.operator;
        // Direct comparison avoids allocating a Set for every assignment-style
        // update, keeping this hot path allocation-free.
        if (operator !== "+=" && operator !== "-=") {
            return null;
        }
    } else {
        return null;
    }

    return {
        iteratorName: iterator.name,
        sizeIdentifierName: arrayIdentifierName,
        cachedLengthSuffix: cachedSuffix
    };
}

function buildCachedSizeVariableName(baseName, suffix) {
    const normalizedSuffix = suffix || "len";

    if (!baseName) {
        return `cached_${normalizedSuffix}`;
    }

    if (baseName.endsWith(`_${normalizedSuffix}`)) {
        return baseName;
    }

    return `${baseName}_${normalizedSuffix}`;
}

export {
    DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES,
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
};
