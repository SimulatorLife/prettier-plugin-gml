import { coercePositiveIntegerOption } from "./option-utils.js";

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

const DEFAULT_LINE_COMMENT_OPTIONS = Object.freeze({
    bannerMinimum: DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES,
    bannerAutofillThreshold: DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD
});

function resolveLineCommentOptions(options) {
    const bannerMinimum = coercePositiveIntegerOption(
        options?.lineCommentBannerMinimumSlashes,
        DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES
    );

    const bannerAutofillThreshold = coercePositiveIntegerOption(
        options?.lineCommentBannerAutofillThreshold,
        DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD,
        {
            zeroReplacement: Number.POSITIVE_INFINITY
        }
    );

    return {
        bannerMinimum,
        bannerAutofillThreshold
    };
}

export { DEFAULT_LINE_COMMENT_OPTIONS, resolveLineCommentOptions };
