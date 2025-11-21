import * as Core from "@gml-modules/core";

const {
    AST: {
        collectCommentNodes,
        getCommentArray,
        hasComment,
        isBlockComment,
        isCommentNode,
        isDocCommentLine,
        isLineComment
    },
    Utils: { getLineBreakCount, splitLines, isObjectLike }
} = Core;
export {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
};
export { getLineBreakCount, splitLines, isObjectLike };
