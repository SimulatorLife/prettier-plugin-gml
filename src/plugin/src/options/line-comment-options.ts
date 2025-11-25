import { Parser } from "@gml-modules/parser";

// TODO: These should be built into ParserOptions, not imported separately like this
export const DEFAULT_LINE_COMMENT_OPTIONS = Parser.DEFAULT_LINE_COMMENT_OPTIONS;
export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Parser.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES =
    Parser.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES;
export const normalizeLineCommentOptions: any =
    Parser.normalizeLineCommentOptions;
export const resolveLineCommentOptions: any = Parser.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver: any =
    Parser.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver: any =
    Parser.setLineCommentOptionsResolver;
