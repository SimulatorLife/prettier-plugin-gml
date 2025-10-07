// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

/**
 * Count the number of line break characters in a string.
 *
 * @param {string} text - The text to inspect.
 * @returns {number} The count of recognised line break characters.
 */
const LINE_BREAK_PATTERN = /\r\n|[\r\n\u2028\u2029]/g;

export function getLineBreakCount(text) {
    if (typeof text !== "string" || text.length === 0) {
        return 0;
    }

    const matches = text.match(LINE_BREAK_PATTERN);
    return matches ? matches.length : 0;
}
