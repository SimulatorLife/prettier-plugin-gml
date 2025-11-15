// Public facade for comment utilities used by the Prettier plugin.
//
// Keeping the exports centralized here allows external consumers (including
// sibling workspaces) to rely on a stable module path instead of importing
// files from the internal directory layout.
import { Core } from "@gml-modules/core";
import { collectCommentNodes, getCommentArray, hasComment, isBlockComment, isCommentNode, isDocCommentLine, isLineComment
} from "./comment-boundary.js";
export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS, DEFAULT_LINE_COMMENT_OPTIONS, normalizeLineCommentOptions, resolveLineCommentOptions, restoreDefaultLineCommentOptionsResolver, setLineCommentOptionsResolver
} from "../options/line-comment-options.js";
export {
    DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION, applyInlinePadding, formatLineComment, getLineCommentRawText, normalizeDocCommentTypeAnnotations, resolveDocCommentTypeNormalization, restoreDefaultDocCommentTypeNormalizationResolver, setDocCommentTypeNormalizationResolver
} from "./line-comment-formatting.js";
export {
    handleComments, printComment, printDanglingComments, printDanglingCommentsAsGroup
} from "./comment-printer.js";
export {
    getHasCommentHelper, normalizeHasCommentHelpers
} from "./has-comment-helpers.js";
export {
    prepareDocCommentEnvironment, resolveDocCommentCollectionService, resolveDocCommentDescriptionService, resolveDocCommentPresenceService, resolveDocCommentTraversalService, resolveDocCommentUpdateService
} from "./doc-comment-manager.js";
export { getCommentValue } = Core;
export { collectCommentNodes, getCommentArray, hasComment, isBlockComment, isCommentNode, isDocCommentLine, isLineComment
} from "./comment-boundary.js";
export {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS, DEFAULT_LINE_COMMENT_OPTIONS, normalizeLineCommentOptions, resolveLineCommentOptions, restoreDefaultLineCommentOptionsResolver, setLineCommentOptionsResolver
} from "../options/line-comment-options.js";
export {
    DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION, applyInlinePadding, formatLineComment, getLineCommentRawText, normalizeDocCommentTypeAnnotations, resolveDocCommentTypeNormalization, restoreDefaultDocCommentTypeNormalizationResolver, setDocCommentTypeNormalizationResolver
} from "./line-comment-formatting.js";
export {
    handleComments, printComment, printDanglingComments, printDanglingCommentsAsGroup
} from "./comment-printer.js";
export {
    getHasCommentHelper, normalizeHasCommentHelpers
} from "./has-comment-helpers.js";
export {
    prepareDocCommentEnvironment, resolveDocCommentCollectionService, resolveDocCommentDescriptionService, resolveDocCommentPresenceService, resolveDocCommentTraversalService, resolveDocCommentUpdateService
} from "./doc-comment-manager.js";
export { getCommentValue };

export { normalizeOptionalParamToken } from "./optional-param-normalization.js";
