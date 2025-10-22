import { isNonEmptyString } from "./string.js";

// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

const LINE_SPLIT_PATTERN = /\r\n|\n|\r|\u2028|\u2029|\u0085/;

const CARRIAGE_RETURN = "\r".codePointAt(0);
const LINE_FEED = "\n".codePointAt(0);
const LINE_SEPARATOR = "\u2028".codePointAt(0);
const PARAGRAPH_SEPARATOR = "\u2029".codePointAt(0);

function getCodePointStep(codePoint) {
    return codePoint > 65_535 ? 2 : 1;
}

function advancePastCarriageReturn(text, index, step) {
    const nextIndex = index + step;
    const nextCode = text.codePointAt(nextIndex);

    if (typeof nextCode === "number" && nextCode === LINE_FEED) {
        return nextIndex + getCodePointStep(nextCode);
    }

    return nextIndex;
}

/**
 * Count the number of line break characters in a string.
 *
 * @param {string} text Text to inspect.
 * @returns {number} Number of recognized line break characters.
 */
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
        const code = text.codePointAt(index);
        if (typeof code !== "number") {
            break;
        }

        const step = getCodePointStep(code);

        if (code === CARRIAGE_RETURN) {
            index = advancePastCarriageReturn(text, index, step);
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

        index += step;
    }

    return count;
}

/**
 * Split {@link text} into individual lines while recognising the newline
 * sequences produced by Windows, Unix, and Unicode line separators.
 *
 * Normalizes the ad-hoc `String#split` logic previously embedded in the
 * project-index syntax error formatter so that future call sites can reuse the
 * same cross-platform handling without re-implementing the regular expression.
 * Non-string inputs return an empty array, mirroring the defensive guards used
 * by other shared helpers that accept optional metadata.
 *
 * @param {unknown} text Text that may contain newline characters.
 * @returns {Array<string>} Ordered list of lines. Blank input yields a single
 *          empty string to mirror native `String#split` semantics.
 */
export function splitLines(text) {
    if (typeof text !== "string") {
        return [];
    }

    return text.split(LINE_SPLIT_PATTERN);
}
