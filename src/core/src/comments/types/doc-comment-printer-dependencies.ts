export type DocCommentPrinterDependencies = {
    formatLineComment(comment: any, options: any): string | null | undefined;
    getLineCommentRawText(comment: any): string | null | undefined;
    resolveLineCommentOptions(options: any): any;
};
