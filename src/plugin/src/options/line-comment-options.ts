import { Parser } from "@gml-modules/parser";

export const DEFAULT_LINE_COMMENT_OPTIONS =
    Parser.Comments.DEFAULT_LINE_COMMENT_OPTIONS;
export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Parser.Comments.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES =
    Parser.Comments.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES;
export const normalizeLineCommentOptions =
    Parser.Comments.normalizeLineCommentOptions;
export const resolveLineCommentOptions =
    Parser.Comments.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver =
    Parser.Comments.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver =
    Parser.Comments.setLineCommentOptionsResolver;
