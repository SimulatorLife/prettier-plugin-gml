// Helpers for detecting and naming cached loop size variables.
// This logic analyzes the AST rather than producing Prettier docs, so it lives
// alongside other printer optimizations instead of the main print pipeline.

import {
    getIdentifierText,
    getCallExpressionArguments,
    getCallExpressionIdentifierName
} from "../shared/ast-node-helpers.js";
import {
    normalizeStringList,
    toNormalizedLowerCaseString
} from "../shared/string-utils.js";
import { hasOwn, isObjectLike } from "../shared/object-utils.js";

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

const SIZE_SUFFIX_CACHE = new WeakMap();

function readCachedSuffixes(options) {
    if (!isObjectLike(options)) {
        return null;
    }

    if (hasOwn(options, LOOP_SIZE_SUFFIX_CACHE)) {
        return options[LOOP_SIZE_SUFFIX_CACHE];
    }

    if (SIZE_SUFFIX_CACHE.has(options)) {
        return SIZE_SUFFIX_CACHE.get(options);
    }

    return null;
}

function cacheSuffixes(options, suffixes) {
    if (!isObjectLike(options)) {
        return;
    }

    if (Object.isExtensible(options)) {
        try {
            Object.defineProperty(options, LOOP_SIZE_SUFFIX_CACHE, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: suffixes
            });
        } catch {
            // Non-extensible option bags (for example frozen objects or exotic
            // proxies) should still memoize results via the fallback WeakMap.
        }
    }

    SIZE_SUFFIX_CACHE.set(options, suffixes);
}

function createSizeSuffixMap(options) {
    const overrides = parseSizeRetrievalFunctionSuffixOverrides(
        isObjectLike(options)
            ? options.loopLengthHoistFunctionSuffixes
            : undefined
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

/**
 * Resolve the table describing loop-length helper names to the suffix they
 * contribute when generating cached variable identifiers.
 *
 * The formatter allows users to override the default suffix map via the
 * `loopLengthHoistFunctionSuffixes` option, where entries are provided as a
 * comma- or newline-delimited list of `functionName:suffix` pairs. A suffix of
 * `-` removes the function from consideration. Results are cached per options
 * bag so repeated printer runs avoid re-parsing configuration values.
 *
 * @param {unknown} options Prettier option bag passed to the printer.
 * @returns {Map<string, string>} Lower-cased function names mapped to suffixes.
 */
function getSizeRetrievalFunctionSuffixes(options) {
    const cached = readCachedSuffixes(options);
    if (cached) {
        return cached;
    }

    const suffixes = createSizeSuffixMap(options);
    cacheSuffixes(options, suffixes);
    return suffixes;
}

/**
 * Normalize `loopLengthHoistFunctionSuffixes` override strings into
 * `[functionName, suffix]` tuples. Entries can be supplied as either
 * comma/newline-delimited strings or arrays. When the suffix is omitted the
 * helper falls back to `"len"`; specifying `-` drops the function entirely.
 *
 * @param {string | string[] | null | undefined} rawValue Raw override value from
 *        user options.
 * @returns {Map<string, string | null>} Canonical override map keyed by
 *          lower-cased function names. `null` indicates the entry should be
 *          removed from the default table.
 */
function parseSizeRetrievalFunctionSuffixOverrides(rawValue) {
    const entries = normalizeStringList(rawValue, {
        allowInvalidType: true
    });

    const overrides = new Map();

    for (const entry of entries) {
        const [rawName, rawSuffix = ""] = entry.split(/[:=]/);
        const normalizedName = toNormalizedLowerCaseString(rawName);
        if (!normalizedName) {
            continue;
        }

        const trimmedSuffix = rawSuffix.trim();
        if (trimmedSuffix === "-") {
            overrides.set(normalizedName, null);
            continue;
        }

        overrides.set(normalizedName, trimmedSuffix || "len");
    }

    return overrides;
}

/**
 * Inspect a `ForStatement` node to determine whether its bounds match the
 * canonical cached-length pattern (`i < fn(array)`), returning the identifiers
 * involved when a match is found.
 *
 * @param {unknown} node AST node to examine.
 * @param {Map<string, string>} [sizeFunctionSuffixes=DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES]
 *        Lookup of normalized function names to cached suffixes.
 * @returns {{
 *     iteratorName: string,
 *     sizeIdentifierName: string,
 *     cachedLengthSuffix: string
 * } | null} Metadata describing the cached variable or `null` when the pattern
 *           does not match.
 */
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

    const functionName = getCallExpressionIdentifierName(callExpression);
    if (!functionName) {
        return null;
    }

    const cachedSuffix = sizeFunctionSuffixes.get(functionName.toLowerCase());
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

/**
 * Construct the cached length variable name derived from the array identifier.
 *
 * Ensures the suffix is present exactly once and defaults to `len` when none is
 * provided so callers can defer that normalization here rather than repeating
 * checks alongside string concatenation.
 *
 * @param {string} baseName Identifier forming the prefix of the cached name.
 * @param {string | null | undefined} suffix Desired suffix to append.
 * @returns {string} Normalized cached variable identifier.
 */
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

/**
 * Verify that the loop update step mutates the iterator referenced in the test
 * expression.
 *
 * Supports both `i++`/`++i` style increments (represented as
 * `IncDecStatement`) and assignment expressions such as `i += 1`. Any other
 * update forms cause loop-length hoisting to bail out so the printer never
 * misidentifies unrelated iterators.
 *
 * @param {unknown} update `ForStatement#update` node.
 * @param {string} iteratorName Name of the iterator variable.
 * @returns {boolean} `true` when the update mutates {@link iteratorName}.
 */
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
