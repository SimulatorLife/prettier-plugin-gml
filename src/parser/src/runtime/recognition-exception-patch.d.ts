/**
 * Check whether {@link value} mirrors the surface area exposed by ANTLR's
 * `RecognitionException`. Parser recoverability helpers need to gracefully
 * inspect both native ANTLR errors and thin wrappers thrown by downstream
 * tooling, so this guard deliberately checks multiple field names instead of
 * relying on `instanceof`.
 *
 * @param {unknown} value Arbitrary error-like object.
 * @returns {value is import("antlr4/error/Errors").RecognitionException}
 *          `true` when {@link value} appears to expose the expected token,
 *          offending token, and context metadata provided by ANTLR.
 */
export declare function isRecognitionExceptionLike(value: any): boolean;
export declare function installRecognitionExceptionLikeGuard(): void;
