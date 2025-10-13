import {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "../../../shared/comments.js";
import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
    DEFAULT_TRAILING_COMMENT_PADDING,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
} from "../options/line-comment-options.js";
import {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations
} from "./line-comment-formatting.js";

export {
    applyInlinePadding,
    collectCommentNodes,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
    DEFAULT_TRAILING_COMMENT_PADDING,
    formatLineComment,
    getLineCommentRawText,
    getCommentArray,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment,
    normalizeDocCommentTypeAnnotations,
    normalizeLineCommentOptions,
    resolveLineCommentOptions
};
