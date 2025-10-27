import { isNonEmptyString } from "./string.js";

// Shared text utility helpers related to line break detection.
// This module centralizes line break handling so parser and printer code
// can share a single implementation instead of duplicating logic.

const CARRIAGE_RETURN = "\r".codePointAt(0);
const LINE_FEED = "\n".codePointAt(0);
const LINE_SEPARATOR = "\u2028".codePointAt(0);
const PARAGRAPH_SEPARATOR = "\u2029".codePointAt(0);
const NEXT_LINE = "\u0085".codePointAt(0);

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

    for (let index = 0; index < text.length; ) {
        const length = getLineBreakLength(text, index);
        if (length === 0) {
            index += 1;
            continue;
        }

        spans.push({ index, length });
        index += length;
    }

    return spans;
}

function getLineBreakLength(text, index) {
    const code = text.codePointAt(index);
    if (!Number.isFinite(code)) {
        return 0;
    }

    if (code === CARRIAGE_RETURN) {
        return text.codePointAt(index + 1) === LINE_FEED ? 2 : 1;
    }

    if (
        code === LINE_FEED ||
        code === LINE_SEPARATOR ||
        code === PARAGRAPH_SEPARATOR ||
        code === NEXT_LINE
    ) {
        return 1;
    }

    return 0;
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

    while (index < text.length) {
        const code = text.charCodeAt(index);

        if (code === CARRIAGE_RETURN) {
            count += 1;

            if (text.charCodeAt(index + 1) === LINE_FEED) {
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if (
            code === LINE_FEED ||
            code === LINE_SEPARATOR ||
            code === PARAGRAPH_SEPARATOR ||
            code === NEXT_LINE
        ) {
            count += 1;
        }

        index += 1;
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

    const spans = getLineBreakSpans(text);
    if (spans.length === 0) {
        return [text];
    }

    const lines = [];
    let start = 0;

    for (const span of spans) {
        lines.push(text.slice(start, span.index));
        start = span.index + span.length;
    }

    lines.push(text.slice(start));
    return lines;
}
