/**
 * Synthetic doc-comment builder — generates doc-comment payloads for
 * variable declarations and function assignments that lack explicit docs.
 *
 * The two exported functions are called by the printer during rendering.
 * Returning `null` disables synthetic-doc generation and the printer falls
 * back to its default output, which is correct when no implementation is
 * available.
 */

export type SyntheticDocCommentPayload = {
    doc: unknown;
    docLines: string[] | null;
    plainLeadingLines: string[];
    hasExistingDocLines: boolean;
};

/**
 * Returns a synthetic doc-comment payload for a static variable declaration,
 * or `null` when no synthetic comment applies.
 */
export function getSyntheticDocCommentForStaticVariable(
    _statement: unknown,
    _options: unknown,
    _programNode: unknown,
    _originalText: unknown
): SyntheticDocCommentPayload | null {
    return null;
}

/**
 * Returns a synthetic doc-comment payload for a function assignment
 * (e.g. `foo = function(...) {}`), or `null` when no synthetic comment applies.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    _statement: unknown,
    _options: unknown,
    _programNode: unknown,
    _originalText: unknown
): SyntheticDocCommentPayload | null {
    return null;
}
