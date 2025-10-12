import { getCachedValue } from "../options/options-cache.js";
import { coercePositiveIntegerOption } from "../options/option-utils.js";

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

const DEFAULT_TRAILING_COMMENT_PADDING = 2;
const DEFAULT_TRAILING_COMMENT_INLINE_OFFSET = 1;

const DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS = Object.freeze([
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
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

function mergeLineCommentOptionOverrides(overrides) {
    if (typeof overrides !== "object" || overrides === null) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return createLineCommentOptions(
        readLineCommentOption(
            overrides.bannerMinimum,
            DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
        ),
        readLineCommentOption(
            overrides.bannerAutofillThreshold,
            DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
        ),
        Array.isArray(overrides.boilerplateFragments)
            ? dedupeFragments(
                DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS,
                overrides.boilerplateFragments
            )
            : DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments
    );
}

const LINE_COMMENT_OPTIONS_CACHE_KEY = Symbol("lineCommentOptions");
const lineCommentOptionsCache = new WeakMap();

function resolveLineCommentOptions(options) {
    if (typeof options !== "object" || options === null) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const {
        lineCommentBannerMinimumSlashes,
        lineCommentBannerAutofillThreshold,
        lineCommentBoilerplateFragments
    } = options;

    const hasBannerOverride = !(
        lineCommentBannerMinimumSlashes === undefined &&
        lineCommentBannerAutofillThreshold === undefined
    );

    const hasBoilerplateOverride = (() => {
        if (typeof lineCommentBoilerplateFragments === "string") {
            return lineCommentBoilerplateFragments.trim().length > 0;
        }

        return lineCommentBoilerplateFragments !== undefined;
    })();

    if (!hasBannerOverride && !hasBoilerplateOverride) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    return getCachedValue(
        options,
        LINE_COMMENT_OPTIONS_CACHE_KEY,
        lineCommentOptionsCache,
        () =>
            mergeLineCommentOptionOverrides({
                bannerMinimum: coerceBannerMinimum(
                    lineCommentBannerMinimumSlashes
                ),
                bannerAutofillThreshold: coerceBannerAutofillThreshold(
                    lineCommentBannerAutofillThreshold
                ),
                boilerplateFragments: getBoilerplateCommentFragments(options)
            })
    );
}

function getTrailingCommentPadding(options) {
    return coercePositiveIntegerOption(
        options?.trailingCommentPadding,
        DEFAULT_TRAILING_COMMENT_PADDING,
        { zeroReplacement: 0 }
    );
}

function getTrailingCommentInlinePadding(options) {
    const padding = getTrailingCommentPadding(options);
    const inlineOffset = coercePositiveIntegerOption(
        options?.trailingCommentInlineOffset,
        DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
        { zeroReplacement: 0 }
    );
    return Math.max(padding - inlineOffset, 0);
}

const BOILERPLATE_FRAGMENTS_CACHE_KEY = Symbol.for(
    "prettier-plugin-gml.lineCommentBoilerplateFragments"
);
const boilerplateFragmentsCache = new WeakMap();

function dedupeFragments(baseFragments, extensions) {
    const merged = new Set(baseFragments);

    for (const fragment of extensions) {
        if (typeof fragment !== "string") {
            continue;
        }

        const trimmed = fragment.trim();
        if (trimmed.length > 0) {
            merged.add(trimmed);
        }
    }

    return Object.freeze(Array.from(merged));
}

function parseBoilerplateFragments(rawValue) {
    if (typeof rawValue !== "string") {
        return DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS;
    }

    const fragments = rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    if (fragments.length === 0) {
        return DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS;
    }

    return dedupeFragments(DEFAULT_BOILERPLATE_COMMENT_FRAGMENTS, fragments);
}

function getBoilerplateCommentFragments(options) {
    return getCachedValue(
        options,
        BOILERPLATE_FRAGMENTS_CACHE_KEY,
        boilerplateFragmentsCache,
        () =>
            parseBoilerplateFragments(options?.lineCommentBoilerplateFragments)
    );
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
    DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
    DEFAULT_TRAILING_COMMENT_PADDING,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
