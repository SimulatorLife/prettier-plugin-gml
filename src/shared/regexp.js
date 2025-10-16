const ESCAPE_REGEXP_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * Escape characters that carry special meaning in regular expressions so the
 * resulting string can be injected into a pattern literal or constructor
 * without altering the intended match. Non-string inputs are normalized to an
 * empty string so optional values can be passed without defensive guards.
 *
 * @param {unknown} text Candidate text to escape for use in a RegExp pattern.
 * @returns {string} Escaped string, or an empty string for non-string inputs.
 */
export function escapeRegExp(text) {
    if (typeof text !== "string") {
        return "";
    }

    return text.replaceAll(ESCAPE_REGEXP_PATTERN, String.raw`\$&`);
}
