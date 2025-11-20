/**
 * Extract a string `code` property from an error-like value.
 *
 * Call sites frequently work with errors originating from Node.js, the CLI,
 * and third-party libraries where the `code` field is optional. Instead of
 * repeating the null checks and type guards, this helper centralizes the
 * logic and returns `null` when the code is missing or non-string. The
 * behaviour mirrors how the formatter already treats optional metadata: only
 * truthy, non-empty strings are considered actionable.
 *
 * @param {unknown} error Candidate error-like value.
 * @returns {string | null} Extracted error code, or `null` when unavailable.
 */
export declare function getErrorCode(error: any): any;
/**
 * Determine whether an error exposes a specific `code` value.
 *
 * Node.js system errors (for example `EACCES`) and some parsing failures use a
 * `code` field to identify the failure category. This guard avoids leaking the
 * string comparison and truthiness checks into consumers by accepting a list
 * of codes and returning `true` only when the error matches one of them.
 *
 * @param {unknown} error Value to inspect for a matching code.
 * @param {...string} codes Allow-listed error codes to test against.
 * @returns {boolean} `true` when {@link error} carries one of {@link codes}.
 */
export declare function isErrorWithCode(error: any, ...codes: any[]): boolean;
/**
 * Retrieve a human-readable message from an error-like value.
 *
 * Consumers frequently receive thrown values that are either strings or
 * `Error` instances with a `message` property. In some cases the message needs
 * to be synthesized—for example when a caller provides a fallback or when the
 * thrown value cannot be stringified (due to accessor errors). This helper
 * mirrors those semantics by accepting an optional fallback that can either be
 * a string or a thunk for lazy evaluation, and by guarding against thrown
 * errors from `String()` coercion. The function always yields a string so
 * surrounding logging and formatting logic can operate without additional
 * defensive branching.
 *
 * @param {unknown} error Value that may represent an error.
 * @param {{ fallback?: string | ((value: unknown) => string) }} [options]
 *        Optional fallback handling when the error lacks a usable message.
 * @returns {string} Normalized message string (possibly empty).
 */
export declare function getErrorMessage(error: any, { fallback }?: {}): any;
/**
 * Retrieve an error message that always resolves to a non-empty string.
 *
 * Several CLI commands previously duplicated the pattern
 * `getErrorMessage(error, { fallback: "" }) || "Unknown error"` to ensure a
 * readable fallback. This helper centralizes that behaviour while tolerating
 * non-string fallbacks, mirroring how other shared utilities normalize input.
 *
 * @param {unknown} error Value that may represent an error.
 * @param {{ fallback?: unknown }} [options]
 * @returns {string} Guaranteed non-empty error message string.
 */
export declare function getErrorMessageOrFallback(error: any, { fallback }?: {}): any;
