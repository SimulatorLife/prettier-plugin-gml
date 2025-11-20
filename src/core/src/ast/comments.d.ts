/**
 * Determines whether a value is a well-formed comment node.
 *
 * @param {unknown} node
 * @returns {node is CommentBlockNode | CommentLineNode}
 */
export declare function isCommentNode(node: any): boolean;
export declare function isLineComment(node: any): boolean;
export declare function isBlockComment(node: any): boolean;
export declare function hasComment(node: any): boolean;
export declare function getCommentArray(owner: any): readonly any[];
export declare function getCommentValue(
    comment: any,
    {
        trim
    }?: {
        trim?: boolean;
    }
): any;
export declare function collectCommentNodes(root: any): any[];
export declare function isDocCommentLine(comment: any): boolean;
