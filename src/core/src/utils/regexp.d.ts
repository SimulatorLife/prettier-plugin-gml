/**
 * Escape characters that carry special meaning in regular expressions so the
 * resulting string can be injected into a pattern literal or constructor
 * without altering the intended match. Non-string inputs are normalized to an
 * empty string so optional values can be passed without defensive guards.
 *
 * @param {unknown} text Candidate text to escape for use in a RegExp pattern.
 * @returns {string} Escaped string, or an empty string for non-string inputs.
 */
export declare function escapeRegExp(text: any): string;
