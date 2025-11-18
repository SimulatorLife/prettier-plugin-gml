import * as Parser from "@gml-modules/parser";

export const DEFAULT_LINE_COMMENT_OPTIONS = Parser.Options.DEFAULT_LINE_COMMENT_OPTIONS;
export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS = Parser.Options.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = Parser.Options.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES;
export const normalizeLineCommentOptions = Parser.Options.normalizeLineCommentOptions;
export const resolveLineCommentOptions = Parser.Options.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver = Parser.Options.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver = Parser.Options.setLineCommentOptionsResolver;
