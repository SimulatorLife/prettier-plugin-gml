// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

/**
 * Count the number of line break characters in a string.
 *
 * @param {string} text - The text to inspect.
 * @returns {number} The count of recognised line break characters.
 */
const CARRIAGE_RETURN = "\r".charCodeAt(0);
const LINE_FEED = "\n".charCodeAt(0);
const LINE_SEPARATOR = "\u2028".charCodeAt(0);
const PARAGRAPH_SEPARATOR = "\u2029".charCodeAt(0);

export function getLineBreakCount(text) {
    if (typeof text !== "string" || text.length === 0) {
        return 0;
    }

    let count = 0;
    let index = 0;

    // Manual scanning avoids creating RegExp match arrays for every call. The
    // parser frequently invokes this helper while iterating over tokens, so we
    // keep the loop tight and operate on character codes directly.
    while (index < text.length) {
        const code = text.charCodeAt(index);

        if (code === CARRIAGE_RETURN) {
            if (text.charCodeAt(index + 1) === LINE_FEED) {
                index += 2;
            } else {
                index += 1;
            }

            count += 1;
            continue;
        }

        if (
            code === LINE_FEED ||
            code === LINE_SEPARATOR ||
            code === PARAGRAPH_SEPARATOR
        ) {
            count += 1;
        }

        index += 1;
    }

    return count;
}
