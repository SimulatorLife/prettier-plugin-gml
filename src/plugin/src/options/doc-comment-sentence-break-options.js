import {
    coalesceOption,
    coercePositiveIntegerOption
} from "../shared/index.js";

const DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE = 60;
const DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE = Number.POSITIVE_INFINITY;
const DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE_OPTION =
    "docCommentMinSentenceBreakSpace";

/**
 * Normalize the minimum available space threshold that triggers sentence-level
 * breaks when wrapping doc comments.
 *
 * When formatting JSDoc-style comments, the formatter may choose to place
 * sentence boundaries on separate lines for improved readability. This option
 * controls the minimum number of characters that must remain available on the
 * current line before the formatter considers breaking at a sentence boundary.
 * Higher values encourage more aggressive sentence breaks, while lower values
 * keep sentences together more often.
 *
 * Accepts the raw plugin `options` bag and falls back to the default when the
 * override is missing or invalid. Explicit `0` values are promoted to
 * {@link DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE} so the calling logic can
 * disable sentence breaking entirely.
 *
 * @param {unknown} options Candidate plugin options object.
 * @returns {number} Minimum space threshold or the disabled sentinel.
 */
function resolveDocCommentMinSentenceBreakSpace(options) {
    const override = coalesceOption(
        options,
        DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE_OPTION
    );

    return coercePositiveIntegerOption(
        override,
        DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE,
        { zeroReplacement: DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE }
    );
}

export {
    DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE,
    DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE,
    DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE_OPTION,
    resolveDocCommentMinSentenceBreakSpace
};
