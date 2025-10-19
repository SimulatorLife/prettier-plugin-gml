export {
    collectCommentNodes,
    hasComment,
    getCommentArray,
    isCommentNode,
    isBlockComment,
    isDocCommentLine,
    isLineComment
} from "./comment-boundary.js";
export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    getLineCommentCodeDetectionPatterns,
    DEFAULT_LINE_COMMENT_OPTIONS,
    resolveLineCommentOptions,
    normalizeLineCommentOptions
} from "../options/line-comment-options.js";
export {
    applyInlinePadding,
    getLineCommentRawText,
    formatLineComment,
    normalizeDocCommentTypeAnnotations
} from "./line-comment-formatting.js";
export {
    handleComments,
    printDanglingComments,
    printComment,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";
export {
    getHasCommentHelper,
    normalizeHasCommentHelpers
} from "./has-comment-helpers.js";
export {
    getDocCommentManager,
    prepareDocCommentEnvironment,
    extractDocumentedParamNames,
    normalizeDocParamNameForComparison,
    isWhitespaceBetween,
    getCommentEndIndex
} from "./doc-comment-manager.js";
