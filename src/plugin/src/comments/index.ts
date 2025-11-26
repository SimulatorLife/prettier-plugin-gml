import { Parser } from "@gml-modules/parser";

export * from "./line-comment-formatting.js";
export * from "./comment-printer.js";
// NOTE: Doc comment helpers live in @gml-modules/core. Avoid re-exporting
// Core functions or creating pass-through shims here — consumers should
// import from `@gml-modules/core` directly.

// Re-export commonly referenced Parser comment helpers as part of the plugin's
// public comments facade. Historically consumers imported these directly from
// the plugin's comments index; during the migration away from the parser
// adapter ensure these values are still available while code transitions to
// referencing `Parser.Comments.*`.
const DEFAULT_LINE_COMMENT_OPTIONS: typeof Parser.DEFAULT_LINE_COMMENT_OPTIONS =
    Parser.DEFAULT_LINE_COMMENT_OPTIONS;
const DEFAULT_COMMENTED_OUT_CODE_PATTERNS: typeof Parser.DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Parser.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES: typeof Parser.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES =
    Parser.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES;
const resolveLineCommentOptions: typeof Parser.resolveLineCommentOptions =
    Parser.resolveLineCommentOptions;
const restoreDefaultLineCommentOptionsResolver: typeof Parser.restoreDefaultLineCommentOptionsResolver =
    Parser.restoreDefaultLineCommentOptionsResolver;
const setLineCommentOptionsResolver: typeof Parser.setLineCommentOptionsResolver =
    Parser.setLineCommentOptionsResolver;

export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
