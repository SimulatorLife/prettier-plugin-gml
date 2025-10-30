import { isNonEmptyString } from "./string.js";

// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

const LINE_BREAK_PATTERN = /\r\n|[\n\r\u2028\u2029\u0085]/gu;
const LINE_BREAK_SPLIT_PATTERN = /\r\n|[\n\r\u2028\u2029\u0085]/u;
const CHAR_CODE_CARRIAGE_RETURN = 0x0d;
const CHAR_CODE_LINE_FEED = 0x0a;
const CHAR_CODE_LINE_SEPARATOR = 0x20_28;
const CHAR_CODE_PARAGRAPH_SEPARATOR = 0x20_29;
const CHAR_CODE_NEXT_LINE = 0x00_85;

function* iterateLineBreaks(text) {
    LINE_BREAK_PATTERN.lastIndex = 0;

    let match;
    while ((match = LINE_BREAK_PATTERN.exec(text))) {
        yield match;
    }
}

/**
 * Describe each recognized line break sequence within {@link text}.
 *
 * @param {unknown} text Candidate string to scan for newline sequences.
 * @returns {Array<{ index: number, length: number }>} Ordered break spans.
 */
export function getLineBreakSpans(text) {
    if (typeof text !== "string" || text.length === 0) {
        return [];
    }

    const spans = [];

    for (const match of iterateLineBreaks(text)) {
        spans.push({ index: match.index, length: match[0].length });
    }

    return spans;
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
    const length = text.length;

    // Scanning the string manually avoids the generator/regExp machinery that
    // `iterateLineBreaks` relies on. Parser hot paths call this helper for
    // nearly every token, so the straight-line loop trims about 25% off the
    // micro-benchmark included in the commit message while preserving the
    // original CRLF collapsing semantics.
    for (let index = 0; index < length; index += 1) {
        const code = text.charCodeAt(index);

        if (code === CHAR_CODE_CARRIAGE_RETURN) {
            if (
                index + 1 < length &&
                text.charCodeAt(index + 1) === CHAR_CODE_LINE_FEED
            ) {
                index += 1;
            }

            count += 1;
            continue;
        }

        if (
            code === CHAR_CODE_LINE_FEED ||
            code === CHAR_CODE_LINE_SEPARATOR ||
            code === CHAR_CODE_PARAGRAPH_SEPARATOR ||
            code === CHAR_CODE_NEXT_LINE
        ) {
            count += 1;
        }
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

    if (text.length === 0) {
        return [""];
    }

    return text.split(LINE_BREAK_SPLIT_PATTERN);
}
