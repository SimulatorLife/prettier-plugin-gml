import { Parser } from "@gml-modules/parser";

// The plugin’s legacy API surface historically exposed comment-formatting
// helpers directly from this module. Keep those entry points intact by
// delegating to the canonical Parser implementations rather than copying
// their logic here.

type FormatLineCommentFn = typeof Parser.formatLineComment;
type ApplyInlinePaddingFn = typeof Parser.applyInlinePadding;
type GetLineCommentRawTextFn = typeof Parser.getLineCommentRawText;
type NormalizeBannerCommentTextFn = typeof Parser.normalizeBannerCommentText;

const formatLineComment: FormatLineCommentFn = (comment, options) => {
    return Parser.formatLineComment(comment, options);
};

const applyInlinePadding: ApplyInlinePaddingFn = (comment, formattedText) => {
    return Parser.applyInlinePadding(comment, formattedText);
};

const getLineCommentRawText: GetLineCommentRawTextFn = (comment) => {
    return Parser.getLineCommentRawText(comment);
};

const normalizeBannerCommentText: NormalizeBannerCommentTextFn = (
    candidate,
    options
) => {
    return Parser.normalizeBannerCommentText(candidate, options);
};

export {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeBannerCommentText
};
