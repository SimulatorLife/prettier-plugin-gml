import { Core } from "@gml-modules/core";

// Re-export a small subset of Core's AST comment helpers to make them
// available through the parser's `comments` public index. This keeps
// the parser transforms importing from `../comments/index.js` and avoids
// duplicating the helper logic across packages.
export const collectCommentNodes = Core.collectCommentNodes;
export const getCommentArray = Core.getCommentArray;
export const hasComment = Core.hasComment;
export const isBlockComment = Core.isBlockComment;
export const isCommentNode = Core.isCommentNode;
export const isDocCommentLine = Core.isDocCommentLine;
export const isLineComment = Core.isLineComment;
export const getCommentValue = Core.getCommentValue;

// Comment node types live under `Core.AST` and are not exported from the
// package root. Consumers should prefer the broader `GameMakerAstNode`
// type where a comment node is conceivable, rather than importing a
// specialized `CommentNode` shape from the package root.
