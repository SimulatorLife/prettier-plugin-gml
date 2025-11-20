declare const DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION: Readonly<{
    synonyms: readonly string[][];
    specifierPrefixes: readonly string[];
    canonicalSpecifierNames: readonly string[][];
}>;
declare function resolveDocCommentTypeNormalization(options?: {}): any;
declare function setDocCommentTypeNormalizationResolver(resolver: any): any;
declare function restoreDefaultDocCommentTypeNormalizationResolver(): any;
declare function getLineCommentRawText(comment: any): any;
declare function normalizeBannerCommentText(
    candidate: any,
    options?: {}
): string;
declare function formatLineComment(comment: any, lineCommentOptions?: any): any;
declare function applyInlinePadding(comment: any, formattedText: any): any;
declare function applyJsDocReplacements(text: any): any;
declare function normalizeDocCommentTypeAnnotations(text: any): any;
export {
    DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText,
    normalizeBannerCommentText,
    normalizeDocCommentTypeAnnotations,
    resolveDocCommentTypeNormalization,
    restoreDefaultDocCommentTypeNormalizationResolver,
    setDocCommentTypeNormalizationResolver,
    applyJsDocReplacements
};
