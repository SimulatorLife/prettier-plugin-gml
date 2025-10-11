import { coercePositiveIntegerOption } from "./option-utils.js";

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    bannerMinimum: DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES,
    bannerAutofillThreshold: DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
});

const LINE_COMMENT_OPTIONS_CACHE_KEY = Symbol("lineCommentOptions");

// Cache resolved option objects when callers override the defaults. Objects
// that remain extensible store their cached value directly on the options
// instance via a non-enumerable Symbol property. Frozen objects fall back to a
// WeakMap so the cache remains bounded.
const lineCommentOptionsCache = new WeakMap();

function resolveLineCommentOptions(options) {
    // This helper runs for every line comment. Fast path the default case to
    // avoid repeatedly normalizing option values when callers leave the
    // thresholds untouched.
    if (typeof options !== "object" || options === null) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const {
        lineCommentBannerMinimumSlashes,
        lineCommentBannerAutofillThreshold
    } = options;

    if (
        lineCommentBannerMinimumSlashes === undefined &&
        lineCommentBannerAutofillThreshold === undefined
    ) {
        return DEFAULT_LINE_COMMENT_OPTIONS;
    }

    const symbolCachedOptions = options[LINE_COMMENT_OPTIONS_CACHE_KEY];
    if (symbolCachedOptions) {
        return symbolCachedOptions;
    }

    const cachedOptions = lineCommentOptionsCache.get(options);
    if (cachedOptions) {
        return cachedOptions;
    }

    const bannerMinimum = coercePositiveIntegerOption(
        lineCommentBannerMinimumSlashes,
        DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
    );

    const bannerAutofillThreshold = coercePositiveIntegerOption(
        lineCommentBannerAutofillThreshold,
        DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
        {
            zeroReplacement: Number.POSITIVE_INFINITY
        }
    );

    const resolvedOptions = {
        bannerMinimum,
        bannerAutofillThreshold
    };

    if (Object.isExtensible(options)) {
        Object.defineProperty(options, LINE_COMMENT_OPTIONS_CACHE_KEY, {
            value: resolvedOptions,
            configurable: false,
            enumerable: false,
            writable: false
        });
    } else {
        lineCommentOptionsCache.set(options, resolvedOptions);
    }

    return resolvedOptions;
}

export { DEFAULT_LINE_COMMENT_OPTIONS, resolveLineCommentOptions };
