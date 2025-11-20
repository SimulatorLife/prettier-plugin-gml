/**
 * Determine whether a thrown value exposes the location-rich fields emitted by
 * the ANTLR-generated parser. The guard accepts both native `SyntaxError`
 * instances and plain objects so long as they provide at least one numeric
 * coordinate (`line` or `column`). Optional metadata such as `rule`,
 * `wrongSymbol`, and `offendingText` must either be absent or string-valued to
 * ensure downstream formatters can surface the details without extra
 * normalization.
 *
 * @param {unknown} value Candidate error-like value to validate.
 * @returns {boolean} `true` when {@link value} resembles a parser syntax error
 *                    with location metadata.
 */
export declare function isSyntaxErrorWithLocation(value: any): boolean;
