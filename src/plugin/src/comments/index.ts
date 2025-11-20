// Public facade for comment utilities used by the Prettier plugin.
//
// Keeping the exports centralized here allows external consumers (including
// sibling workspaces) to rely on a stable module path instead of importing
// files from the internal directory layout.
import { Core } from "@gml-modules/core";
import * as Parser from "@gml-modules/parser";

export {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "./comment-boundary.js";

export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Parser.Options.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const DEFAULT_LINE_COMMENT_OPTIONS =
    Parser.Options.DEFAULT_LINE_COMMENT_OPTIONS;
export const normalizeLineCommentOptions =
    Parser.Options.normalizeLineCommentOptions;
export const resolveLineCommentOptions =
    Parser.Options.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver =
    Parser.Options.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver =
    Parser.Options.setLineCommentOptionsResolver;

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

// Re-export the small helper from the canonical core package. Export via a
// direct const alias to avoid destructuring the `Core` namespace (AGENTS.md).
export const getCommentValue = Core.getCommentValue;

export { normalizeOptionalParamToken } from "./optional-param-normalization.js";
