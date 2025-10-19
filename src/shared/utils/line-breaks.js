import { isNonEmptyString } from "./string.js";

// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

/**
 * Count the number of line break characters in a string.
 *
 * @param {string} text Text to inspect.
 * @returns {number} Number of recognized line break characters.
 */
const CARRIAGE_RETURN = "\r".charCodeAt(0);
const LINE_FEED = "\n".charCodeAt(0);
const LINE_SEPARATOR = "\u2028".charCodeAt(0);
const PARAGRAPH_SEPARATOR = "\u2029".charCodeAt(0);

export function getLineBreakCount(text) {
    if (!isNonEmptyString(text)) {
        return 0;
    }

    let count = 0;
    let index = 0;
    // Hoist the length so the tight loop below only pays the property lookup
    // once. The parser feeds this helper entire script bodies, so avoiding
    // per-iteration property reads keeps large exports (tens of thousands of
    // characters) from regressing due to needless engine work.
    const length = text.length;

    // Manual scanning avoids creating RegExp match arrays for every call. The
    // parser frequently invokes this helper while iterating over tokens, so we
    // keep the loop tight and operate on character codes directly.
    while (index < length) {
        const code = text.charCodeAt(index);

        if (code === CARRIAGE_RETURN) {
            const nextIndex = index + 1;
            const nextCode = text.charCodeAt(nextIndex);

            index = nextCode === LINE_FEED ? nextIndex + 1 : nextIndex;

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
