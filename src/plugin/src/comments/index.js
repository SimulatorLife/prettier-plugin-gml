export {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "./comment-boundary.js";
export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
} from "../options/line-comment-options.js";
export {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations
} from "./line-comment-formatting.js";
export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";
export {
    getHasCommentHelper,
    normalizeHasCommentHelpers
} from "./has-comment-helpers.js";
export {
    prepareDocCommentEnvironment,
    resolveDocCommentCollectionService,
    resolveDocCommentDescriptionService,
    resolveDocCommentPresenceService,
    resolveDocCommentTraversalService,
    resolveDocCommentUpdateService
} from "./doc-comment-manager.js";
export { getCommentValue } from "../shared/index.js";
