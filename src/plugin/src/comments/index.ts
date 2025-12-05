import { Core } from "@gml-modules/core";
import {
    formatLineComment,
    getLineCommentRawText
} from "./line-comment-formatting.js";
import { resolveLineCommentOptions } from "./line-comment-options.js";

Core.setDocCommentPrinterDependencies({
    formatLineComment,
    getLineCommentRawText,
    resolveLineCommentOptions
});

export * from "./line-comment-options.js";
export * from "./line-comment-formatting.js";
export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
} from "./comment-printer.js";
