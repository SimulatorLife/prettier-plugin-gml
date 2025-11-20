export declare function createCommentLineNode(options: any): any;
export declare function createCommentBlockNode(options: any): any;
export declare function createWhitespaceNode({
    token,
    tokenText,
    isNewline
}: {
    token: any;
    tokenText: any;
    isNewline: any;
}): {
    type: string;
    value: string;
    start: {
        line: any;
        index: any;
    };
    end: {
        line: any;
        index: any;
    };
    line: any;
    isNewline: boolean;
};
