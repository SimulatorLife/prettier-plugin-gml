import { Core } from "@gml-modules/core";
export { collectCommentNodes, getCommentArray, hasComment, isBlockComment, isCommentNode, isDocCommentLine, isLineComment } from "./comments.js";
// Re-export select utilities from the shared core utilities namespace.
export const getLineBreakCount = Core.Utils.getLineBreakCount;
export const splitLines = Core.Utils.splitLines;
export const isObjectLike = Core.Utils.isObjectLike;
//# sourceMappingURL=comment-boundary.js.map