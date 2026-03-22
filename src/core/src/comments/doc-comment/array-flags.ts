/**
 * Copy doc-comment metadata flags from a source array to a target array.
 * These flags control formatting behavior for doc comment arrays and should
 * be preserved when arrays are cloned or transformed.
 *
 * This helper lives with the doc-comment subsystem rather than the generic
 * array utilities because the copied flags are doc-comment-specific metadata,
 * not reusable array behavior.
 *
 * @template T
 * @param {Array<T>} source Source array that may contain doc comment flags.
 * @param {Array<T>} target Target array to receive the flags.
 * @returns {Array<T>} The target array (for chaining).
 */
export function copyDocCommentArrayFlags<T>(source: Array<T>, target: Array<T>): Array<T> {
    if (!Array.isArray(source) || !Array.isArray(target)) {
        return target;
    }

    const src = source as any;
    const tgt = target as any;

    if (src._preserveDescriptionBreaks === true) {
        tgt._preserveDescriptionBreaks = true;
    }
    if (src._suppressLeadingBlank === true) {
        tgt._suppressLeadingBlank = true;
    }
    if (src._blockCommentDocs === true) {
        tgt._blockCommentDocs = true;
    }

    return target;
}
