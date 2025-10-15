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
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_PADDING,
    getLineCommentCodeDetectionPatterns,
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
import {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";

export {
    applyInlinePadding,
    collectCommentNodes,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_TRAILING_COMMENT_PADDING,
    formatLineComment,
    getCommentArray,
    getLineCommentCodeDetectionPatterns,
    getLineCommentRawText,
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
