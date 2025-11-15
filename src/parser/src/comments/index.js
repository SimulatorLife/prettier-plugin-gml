import { Core } from "@gml-modules/core";
import {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "./comment-boundary.js";

const {
    AST: { getCommentValue }
} = Core;

export {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment,
    getCommentValue
};

export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
} from "../options/line-comment-options.js";

export {
    DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeDocCommentTypeAnnotations,
    resolveDocCommentTypeNormalization,
    restoreDefaultDocCommentTypeNormalizationResolver,
    setDocCommentTypeNormalizationResolver
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

export { normalizeOptionalParamToken } from "./optional-param-normalization.js";
