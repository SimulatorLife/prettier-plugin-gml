import { Parser } from "@gml-modules/parser";
import { Core } from "@gml-modules/core";

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
export const DEFAULT_LINE_COMMENT_OPTIONS = Parser.DEFAULT_LINE_COMMENT_OPTIONS;
export const DEFAULT_COMMENTED_OUT_CODE_PATTERNS =
    Parser.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;
export const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES =
    Parser.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES;
export const resolveLineCommentOptions = Parser.resolveLineCommentOptions;
export const restoreDefaultLineCommentOptionsResolver =
    Parser.restoreDefaultLineCommentOptionsResolver;
export const setLineCommentOptionsResolver =
    Parser.setLineCommentOptionsResolver;
