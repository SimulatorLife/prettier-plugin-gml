import { mergeUniqueValues } from "../../../shared/array-utils.js";
import {
    getNonEmptyTrimmedString,
    isNonEmptyTrimmedString,
    normalizeStringList
} from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import { createCachedOptionResolver } from "./options-cache.js";
import { isRegExpLike } from "../../../shared/utils/capability-probes.js";

const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 5;
const LINE_COMMENT_BANNER_STANDARD_LENGTH = 60;

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
]);

const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Object.freeze([
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[{}()[\].]/,
    /^#/
]);

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
    codeDetectionPatterns: DEFAULT_COMMENTED_OUT_CODE_PATTERNS
});

function mergeBoilerplateFragments(
    rawFragments,
    { splitPattern = null, requireArrayInput = false } = {}
) {
    if (requireArrayInput && !Array.isArray(rawFragments)) {
        return DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS;
    }

    const normalizedFragments = normalizeStringList(rawFragments, {
        splitPattern,
        allowInvalidType: true
    });

    if (normalizedFragments.length === 0) {
        return DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS;
    }

    return mergeUniqueValues(
        DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
        normalizedFragments
    );
}

function mergeLineCommentOptionOverrides(overrides) {
    if (!isObjectLike(overrides)) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const boilerplateFragments = mergeBoilerplateFragments(
        overrides.boilerplateFragments,
        { requireArrayInput: true }
    );

    const hasCodeDetectionOverride =
        overrides.codeDetectionPatterns !== undefined;

    const merged = {
        boilerplateFragments
    };

    merged.codeDetectionPatterns = hasCodeDetectionOverride
        ? mergeCodeDetectionPatterns(overrides.codeDetectionPatterns, {
              allowStringLists: true
          })
        : DEFAULT_COMMENTED_OUT_CODE_PATTERNS;

    return merged;
}

const LINE_COMMENT_OPTIONS_CACHE_KEY = Symbol("lineCommentOptions");

const resolveLineCommentOptionsCached = createCachedOptionResolver({
    cacheKey: LINE_COMMENT_OPTIONS_CACHE_KEY,
    compute: (options = {}) => {
        const hasCodeDetectionOverrideValue = hasCodeDetectionOverride(
            options.lineCommentCodeDetectionPatterns
        );

        const boilerplateFragments = getBoilerplateCommentFragments(options);

        return {
            boilerplateFragments,
            codeDetectionPatterns: hasCodeDetectionOverrideValue
                ? getLineCommentCodeDetectionPatterns(options)
                : DEFAULT_COMMENTED_OUT_CODE_PATTERNS
        };
    }
});

function hasBoilerplateOverride(value) {
    if (typeof value === "string") {
        return isNonEmptyTrimmedString(value);
    }

    return value !== undefined;
}

function resolveLineCommentOptions(options) {
    if (!isObjectLike(options)) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const {
        lineCommentBoilerplateFragments,
        lineCommentCodeDetectionPatterns
    } = options;

    const hasBoilerplateOverrideValue = hasBoilerplateOverride(
        lineCommentBoilerplateFragments
    );

    const hasCodeDetectionOverrideValue = hasCodeDetectionOverride(
        lineCommentCodeDetectionPatterns
    );

    if (!hasBoilerplateOverrideValue && !hasCodeDetectionOverrideValue) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return resolveLineCommentOptionsCached(options);
}

const BOILERPLATE_FRAGMENTS_CACHE_KEY = Symbol.for(
    "prettier-plugin-gml.lineCommentBoilerplateFragments"
);

const getBoilerplateCommentFragmentsCached = createCachedOptionResolver({
    cacheKey: BOILERPLATE_FRAGMENTS_CACHE_KEY,
    compute: (options) =>
        parseBoilerplateFragments(options?.lineCommentBoilerplateFragments)
});

function parseBoilerplateFragments(rawValue) {
    return mergeBoilerplateFragments(rawValue, { splitPattern: /,/ });
}

function getBoilerplateCommentFragments(options) {
    return getBoilerplateCommentFragmentsCached(options);
}

const CODE_DETECTION_PATTERNS_CACHE_KEY = Symbol.for(
    "prettier-plugin-gml.lineCommentCodeDetectionPatterns"
);

const getLineCommentCodeDetectionPatternsCached = createCachedOptionResolver({
    cacheKey: CODE_DETECTION_PATTERNS_CACHE_KEY,
    compute: (options) =>
        mergeCodeDetectionPatterns(options?.lineCommentCodeDetectionPatterns, {
            allowStringLists: true
        })
});

function mergeCodeDetectionPatterns(
    rawValue,
    { allowStringLists = false } = {}
) {
    if (rawValue == undefined) {
        return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    }

    let entries = null;

    if (Array.isArray(rawValue)) {
        entries = rawValue;
    } else if (isRegExpLike(rawValue)) {
        entries = [rawValue];
    } else if (allowStringLists) {
        entries = normalizeStringList(rawValue, { allowInvalidType: true });
    }

    if (!entries || entries.length === 0) {
        return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    }

    return mergeUniqueValues(DEFAULT_COMMENTED_OUT_CODE_PATTERNS, entries, {
        coerce: coerceRegExp,
        getKey: (pattern) =>
            typeof pattern?.toString === "function"
                ? pattern.toString()
                : String(pattern)
    });
}

function coerceRegExp(value) {
    if (isRegExpLike(value)) {
        return value;
    }

    const trimmed = getNonEmptyTrimmedString(value);
    if (!trimmed) {
        return null;
    }

    const literalMatch = trimmed.match(/^\/(.*)\/([a-z]*)$/i);
    if (literalMatch) {
        const [, source, flags = ""] = literalMatch;
        try {
            return new RegExp(source, flags);
        } catch {
            return null;
        }
    }

    try {
        return new RegExp(trimmed);
    } catch {
        return null;
    }
}

function hasCodeDetectionOverride(value) {
    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (isRegExpLike(value)) {
        return true;
    }

    return isNonEmptyTrimmedString(value);
}

function getLineCommentCodeDetectionPatterns(options) {
    return getLineCommentCodeDetectionPatternsCached(options);
}

function normalizeLineCommentOptions(lineCommentOptions) {
    if (lineCommentOptions === DEFAULT_LINE_COMMENT_OPTIONS) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    if (lineCommentOptions && typeof lineCommentOptions === "object") {
        return mergeLineCommentOptionOverrides(lineCommentOptions);
    }

    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
    getLineCommentCodeDetectionPatterns,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
