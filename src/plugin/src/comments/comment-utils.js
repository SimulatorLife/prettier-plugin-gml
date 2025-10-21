import { isObjectLike } from "../../../shared/object-utils.js";

/**
 * Extract the string value from a comment node or raw string input.
 *
 * Guards against nullish and non-object inputs so call sites can operate on
 * parser comments or manual stubs without sprinkling defensive checks. The
 * optional `trim` flag mirrors the handful of locations that need the trimmed
 * text while preserving trailing whitespace for consumers that rely on the
 * original value.
 *
 * @param {unknown} comment Comment node or string-like value to normalize.
 * @param {{ trim?: boolean }} [options]
 * @returns {string} Normalized comment string (trimmed when requested).
 */
export function getCommentValue(comment, { trim = false } = {}) {
    if (typeof comment === "string") {
        return trim ? comment.trim() : comment;
    }

    if (!isObjectLike(comment) || typeof comment?.value !== "string") {
        return "";
    }

    const value = comment.value;
    return trim ? value.trim() : value;
}
