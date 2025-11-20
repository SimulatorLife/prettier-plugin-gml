declare const LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES = 4;
declare const DEFAULT_COMMENTED_OUT_CODE_PATTERNS: readonly RegExp[];
declare const DEFAULT_LINE_COMMENT_OPTIONS: Readonly<{
    boilerplateFragments: readonly string[];
    codeDetectionPatterns: readonly RegExp[];
}>;
declare function normalizeLineCommentOptions(options: any): Readonly<{
    boilerplateFragments: any;
    codeDetectionPatterns: any;
}>;
declare function resolveLineCommentOptions(options?: {}): any;
/**
 * Registers a custom resolver for the line comment heuristics. Intended for
 * host integrations that need to extend the boilerplate detection rules
 * without exposing additional end-user configuration.
 */
declare function setLineCommentOptionsResolver(resolver: any): any;
/**
 * Restores the built-in resolver so callers can tear down ad-hoc
 * customizations and return to the opinionated defaults.
 */
declare function restoreDefaultLineCommentOptionsResolver(): any;
export {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    normalizeLineCommentOptions,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
};
