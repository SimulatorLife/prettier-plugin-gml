import {
    coerceNonNegativeInteger,
    normalizeNumericOption
} from "../../../shared/utils/numeric-options.js";
import { hasOwn, isObjectLike } from "../../../shared/object-utils.js";

import { createCachedOptionResolver } from "./options-cache.js";

const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 5;
const LINE_COMMENT_BANNER_STANDARD_LENGTH = 60;

const LINE_COMMENT_BANNER_LENGTH_OPTION_NAME = "gmlLineCommentBannerLength";
const LINE_COMMENT_BANNER_LENGTH_INTERNAL_OPTION_NAME =
    "__gmlLineCommentBannerLength";
const LINE_COMMENT_OPTIONS_CACHE_KEY = "__gmlLineCommentOptions";

const LINE_COMMENT_OPTIONS_FLAG = Symbol.for(
    "prettier-plugin-gml.lineCommentOptions"
);

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    // YoYo Games injects this banner while exporting assets; stripping it keeps
    // source control diffs focused on meaningful edits instead of generated noise.
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information",
    // New script files start with placeholder documentation that adds no signal to
    // version control, so we redact it automatically.
    "@description Insert description here",
    // The IDE also seeds a generic reminder about the built-in editor; keeping it
    // out of repositories avoids churn when importing starter assets.
    "You can write your code in this editor"
]);

// These heuristics flag the most common "commented out" snippets so they stay
// verbatim without requiring extra configuration from consumers.
const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Object.freeze([
    /^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i,
    /^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/,
    /^[{}()[\].]/,
    /^#/
]);

function defineOptionsFlag(options) {
    if (!isObjectLike(options)) {
        return options;
    }

    Object.defineProperty(options, LINE_COMMENT_OPTIONS_FLAG, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: true
    });

    return options;
}

function createLineCommentOptions({ bannerLength } = {}) {
    const resolvedBannerLength =
        bannerLength ?? LINE_COMMENT_BANNER_STANDARD_LENGTH;

    const options = {
        boilerplateFragments: DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
        codeDetectionPatterns: DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
        bannerLength: resolvedBannerLength
    };

    defineOptionsFlag(options);
    return Object.freeze(options);
}

const DEFAULT_LINE_COMMENT_OPTIONS = createLineCommentOptions();

function getLineCommentCodeDetectionPatterns() {
    return DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
}

function formatBannerLengthTypeError(optionName, type) {
    return `${optionName} must be provided as a number (received type '${type}').`;
}

function formatBannerLengthValueError(optionName, received) {
    return `${optionName} must be a non-negative integer (received ${received}).`;
}

function coerceLineCommentBannerLength(numericValue, context) {
    const { optionName, received } = context;

    return coerceNonNegativeInteger(numericValue, {
        received,
        createErrorMessage: (value) =>
            formatBannerLengthValueError(optionName, value)
    });
}

function normalizeLineCommentBannerLength(rawValue, { optionName }) {
    return normalizeNumericOption(rawValue, {
        optionName,
        coerce: coerceLineCommentBannerLength,
        formatTypeError: formatBannerLengthTypeError
    });
}

function getBannerLengthOption(options) {
    if (!isObjectLike(options)) {
        return;
    }

    if (hasOwn(options, LINE_COMMENT_BANNER_LENGTH_INTERNAL_OPTION_NAME)) {
        return options[LINE_COMMENT_BANNER_LENGTH_INTERNAL_OPTION_NAME];
    }

    if (hasOwn(options, LINE_COMMENT_BANNER_LENGTH_OPTION_NAME)) {
        return options[LINE_COMMENT_BANNER_LENGTH_OPTION_NAME];
    }

    return;
}

function resolveLineCommentBannerLength(options) {
    const rawValue = getBannerLengthOption(options);

    if (rawValue === undefined) {
        return;
    }

    return normalizeLineCommentBannerLength(rawValue, {
        optionName: LINE_COMMENT_BANNER_LENGTH_OPTION_NAME
    });
}

const resolveLineCommentOptions = createCachedOptionResolver({
    cacheKey: LINE_COMMENT_OPTIONS_CACHE_KEY,
    compute(options) {
        const bannerLength = resolveLineCommentBannerLength(options);

        if (bannerLength === undefined) {
            return DEFAULT_LINE_COMMENT_OPTIONS;
        }

        if (bannerLength === DEFAULT_LINE_COMMENT_OPTIONS.bannerLength) {
            return DEFAULT_LINE_COMMENT_OPTIONS;
        }

        return createLineCommentOptions({ bannerLength });
    }
});

function normalizeLineCommentOptions(lineCommentOptions) {
    if (
        isObjectLike(lineCommentOptions) &&
        lineCommentOptions[LINE_COMMENT_OPTIONS_FLAG] === true
    ) {
        return lineCommentOptions;
    }

    return DEFAULT_LINE_COMMENT_OPTIONS;
}

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
    LINE_COMMENT_BANNER_LENGTH_OPTION_NAME,
    getLineCommentCodeDetectionPatterns,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
