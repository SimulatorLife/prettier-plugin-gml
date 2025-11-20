/**
 * Describe each recognized line break sequence within {@link text}.
 *
 * @param {unknown} text Candidate string to scan for newline sequences.
 * @returns {Array<{ index: number, length: number }>} Ordered break spans.
 */
export declare function getLineBreakSpans(text: any): any[];
/**
 * Count the number of line break characters in a string.
 *
 * @param {string} text Text to inspect.
 * @returns {number} Number of recognized line break characters.
 */
export declare function getLineBreakCount(text: any): number;
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
export declare function splitLines(text: any): string[];
