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
    LINE_COMMENT_BANNER_LENGTH_OPTION_NAME,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
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
    resolveDocCommentInspectionService,
    resolveDocCommentUpdateService
} from "./doc-comment-manager.js";
export { getCommentValue } from "./comment-utils.js";
