import { Core } from "@gml-modules/core";

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";

export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Core.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const DEFAULT_LINE_COMMENT_OPTIONS = Core.DEFAULT_LINE_COMMENT_OPTIONS;
export const formatLineComment: typeof Core.formatLineComment =
    Core.formatLineComment;
export const resolveLineCommentOptions: typeof Core.resolveLineCommentOptions =
    Core.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver: typeof Core.restoreDefaultLineCommentOptionsResolver =
    Core.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver: typeof Core.setLineCommentOptionsResolver =
    Core.setLineCommentOptionsResolver;
