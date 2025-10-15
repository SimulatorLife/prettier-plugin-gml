// Helpers for detecting and naming cached loop size variables.
// This logic analyzes the AST rather than producing Prettier docs, so it lives
// alongside other printer optimizations instead of the main print pipeline.

import {
    getIdentifierText,
    getCallExpressionArguments
} from "../../../shared/ast-node-helpers.js";
import { createCachedOptionResolver } from "../options/options-cache.js";
import {
    normalizeStringList,
    toNormalizedLowerCaseString
} from "../../../shared/string-utils.js";

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

const getSizeRetrievalFunctionSuffixesCached = createCachedOptionResolver({
    cacheKey: LOOP_SIZE_SUFFIX_CACHE,
    compute: (options = {}) => {
        const overrides = parseSizeRetrievalFunctionSuffixOverrides(
            options.loopLengthHoistFunctionSuffixes
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
});

function getSizeRetrievalFunctionSuffixes(options) {
    return getSizeRetrievalFunctionSuffixesCached(options);
}

function parseSizeRetrievalFunctionSuffixOverrides(rawValue) {
    const entries = normalizeStringList(rawValue, {
        allowInvalidType: true
    });

    if (entries.length === 0) {
        return new Map();
    }

    const overrides = entries.flatMap((entry) => {
        const [rawName, rawSuffix = ""] = entry.split(/[:=]/);
        const normalizedName = toNormalizedLowerCaseString(rawName);
        if (!normalizedName) {
            return [];
        }

        const trimmedSuffix = rawSuffix.trim();
        if (trimmedSuffix === "-") {
            return [[normalizedName, null]];
        }

        const normalizedSuffix = trimmedSuffix || "len";
        return [[normalizedName, normalizedSuffix]];
    });

    return new Map(overrides);
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

    const args = getCallExpressionArguments(callExpression);
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

    if (!isIteratorUpdateMatching(node.update, iterator.name)) {
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

function isIteratorUpdateMatching(update, iteratorName) {
    if (!update) {
        return false;
    }

    if (update.type === "IncDecStatement") {
        const argument = update.argument;
        return (
            !!argument &&
            argument.type === "Identifier" &&
            argument.name === iteratorName
        );
    }

    if (update.type !== "AssignmentExpression") {
        return false;
    }

    const left = update.left;
    if (!left || left.type !== "Identifier" || left.name !== iteratorName) {
        return false;
    }

    const operator = update.operator;
    // Direct comparison avoids allocating a Set for every assignment-style
    // update, keeping this hot path allocation-free.
    return operator === "+=" || operator === "-=";
}

export {
    DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES,
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
};
