const ESCAPE_REGEXP_PATTERN = /[.*+?^${}()|[\]\\]/g;
const ESCAPE_REGEXP_REPLACEMENT = String.raw`\$&`;

/**
 * Pattern matching valid GML identifier names. GML identifiers must start with
 * a letter (A-Z, a-z) or underscore, followed by zero or more letters, digits,
 * or underscores. This pattern is used across the codebase for validation,
 * normalization, and safety checks when generating or manipulating identifiers.
 *
 * @type {RegExp}
 */
export const GML_IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Escape characters that carry special meaning in regular expressions so the
 * resulting string can be injected into a pattern literal or constructor
 * without altering the intended match. Non-string inputs are normalized to an
 * empty string so optional values can be passed without defensive guards.
 *
 * @param {unknown} [text] Candidate text to escape for use in a RegExp pattern.
 * @returns {string} Escaped string, or an empty string for non-string inputs.
 */
export function escapeRegExp(text?: unknown) {
    if (typeof text !== "string") {
        return "";
    }

    if (!ESCAPE_REGEXP_PATTERN.test(text)) {
        ESCAPE_REGEXP_PATTERN.lastIndex = 0;
        return text;
    }

    ESCAPE_REGEXP_PATTERN.lastIndex = 0;
    return text.replace(ESCAPE_REGEXP_PATTERN, ESCAPE_REGEXP_REPLACEMENT);
}
