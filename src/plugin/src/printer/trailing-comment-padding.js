import { coercePositiveIntegerOption } from "./option-utils.js";

const DEFAULT_TRAILING_COMMENT_PADDING = 2;

function getTrailingCommentPadding(options) {
    return coercePositiveIntegerOption(
        options?.trailingCommentPadding,
        DEFAULT_TRAILING_COMMENT_PADDING,
        { zeroReplacement: 0 }
    );
}

function getTrailingCommentInlinePadding(options) {
    const padding = getTrailingCommentPadding(options);
    return Math.max(padding - 1, 0);
}

export {
    DEFAULT_TRAILING_COMMENT_PADDING,
    getTrailingCommentPadding,
    getTrailingCommentInlinePadding
};
