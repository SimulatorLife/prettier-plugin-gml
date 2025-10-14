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
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    normalizeLineCommentOptions,
    getLineCommentCodeDetectionPatterns,
    resolveLineCommentOptions
} from "../options/line-comment-options.js";
import {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations
} from "./line-comment-formatting.js";
import {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";

export {
    applyInlinePadding,
    collectCommentNodes,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_INLINE_OFFSET,
    DEFAULT_TRAILING_COMMENT_PADDING,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    formatLineComment,
    getLineCommentRawText,
    getCommentArray,
    getLineCommentCodeDetectionPatterns,
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    handleComments,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment,
    normalizeDocCommentTypeAnnotations,
    normalizeLineCommentOptions,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup,
    resolveLineCommentOptions
};
