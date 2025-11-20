export declare function createHiddenNodeProcessor({
    comments,
    whitespaces,
    lexerTokens
}: {
    comments: any;
    whitespaces: any;
    lexerTokens: any;
}): {
    hasReachedEnd(): boolean;
    processToken(token: any): void;
};
