import { mergeUniqueValues } from "../../../shared/array-utils.js";
import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import { createCachedOptionResolver } from "../../../shared/options-cache.js";
import {
    coercePositiveIntegerOption,
    normalizeStringList
} from "./option-utils.js";

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

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
    bannerMinimum: DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES,
    bannerAutofillThreshold: DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
    boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS
});

function coerceBannerMinimum(value) {
    return coercePositiveIntegerOption(
        value,
        DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
    );
}

function coerceBannerAutofillThreshold(value) {
    return coercePositiveIntegerOption(
        value,
        DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
        { zeroReplacement: Number.POSITIVE_INFINITY }
    );
}

function createLineCommentOptions(
    bannerMinimum,
    bannerAutofillThreshold,
    boilerplateFragments = DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS
) {
    return {
        bannerMinimum,
        bannerAutofillThreshold,
        boilerplateFragments
    };
}

function readLineCommentOption(value, fallback) {
    return typeof value === "number" ? value : fallback;
}

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

    const merged = createLineCommentOptions(
        readLineCommentOption(
            overrides.bannerMinimum,
            DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
        ),
        readLineCommentOption(
            overrides.bannerAutofillThreshold,
            DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
        ),
        boilerplateFragments
    );

    if (overrides.codeDetectionPatterns === undefined) {
        return merged;
    }

    return {
        ...merged,
        codeDetectionPatterns: mergeCodeDetectionPatterns(
            overrides.codeDetectionPatterns,
            { allowStringLists: true }
        )
    };
}

const LINE_COMMENT_OPTIONS_CACHE_KEY = Symbol("lineCommentOptions");

const resolveLineCommentOptionsCached = createCachedOptionResolver({
    cacheKey: LINE_COMMENT_OPTIONS_CACHE_KEY,
    compute: (options = {}) => {
        const hasCodeDetectionOverrideValue = hasCodeDetectionOverride(
            options.lineCommentCodeDetectionPatterns
        );

        return mergeLineCommentOptionOverrides({
            bannerMinimum: coerceBannerMinimum(
                options.lineCommentBannerMinimumSlashes
            ),
            bannerAutofillThreshold: coerceBannerAutofillThreshold(
                options.lineCommentBannerAutofillThreshold
            ),
            boilerplateFragments: getBoilerplateCommentFragments(options),
            codeDetectionPatterns: hasCodeDetectionOverrideValue
                ? getLineCommentCodeDetectionPatterns(options)
                : undefined
        });
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
        lineCommentBannerMinimumSlashes,
        lineCommentBannerAutofillThreshold,
        lineCommentBoilerplateFragments,
        lineCommentCodeDetectionPatterns
    } = options;

    const hasBannerOverride =
        lineCommentBannerMinimumSlashes !== undefined ||
        lineCommentBannerAutofillThreshold !== undefined;
    const hasBoilerplateOverrideValue = hasBoilerplateOverride(
        lineCommentBoilerplateFragments
    );

    const hasCodeDetectionOverrideValue = hasCodeDetectionOverride(
        lineCommentCodeDetectionPatterns
    );

    if (
        !hasBannerOverride &&
        !hasBoilerplateOverrideValue &&
        !hasCodeDetectionOverrideValue
    ) {
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
    if (rawValue == null) {
        return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    }

    let entries = null;

    if (Array.isArray(rawValue)) {
        entries = rawValue;
    } else if (rawValue instanceof RegExp) {
        entries = [rawValue];
    } else if (allowStringLists) {
        entries = normalizeStringList(rawValue, { allowInvalidType: true });
    }

    if (!entries || entries.length === 0) {
        return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
    }

    return mergeUniqueValues(DEFAULT_COMMENTED_OUT_CODE_PATTERNS, entries, {
        coerce: coerceRegExp,
        getKey: (pattern) => pattern.toString()
    });
}

function coerceRegExp(value) {
    if (value instanceof RegExp) {
        return value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
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

    if (value instanceof RegExp) {
        return true;
    }

    return isNonEmptyTrimmedString(value);
}

function getLineCommentCodeDetectionPatterns(options) {
    return getLineCommentCodeDetectionPatternsCached(options);
}

function normalizeLineCommentOptions(lineCommentOptions) {
    if (
        typeof lineCommentOptions === "number" &&
        Number.isFinite(lineCommentOptions)
    ) {
        return mergeLineCommentOptionOverrides({
            bannerMinimum: lineCommentOptions
        });
    }

    if (lineCommentOptions && typeof lineCommentOptions === "object") {
        return mergeLineCommentOptionOverrides(lineCommentOptions);
    }

    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    getLineCommentCodeDetectionPatterns,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
