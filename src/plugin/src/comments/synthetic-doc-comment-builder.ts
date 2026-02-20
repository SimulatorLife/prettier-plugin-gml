import { type Doc } from "prettier";

/**
 * The result of building a synthetic doc comment for a GML statement.
 * When present, the printer inserts it before the statement.
 */
export type SyntheticDocCommentPayload = {
    /** Plain comment lines that precede the doc block (e.g., existing single-line comments). */
    plainLeadingLines: string[];
    /** Rendered Prettier Doc for the generated doc comment block. */
    doc: Doc;
    /** Raw doc-comment-line array used to check whether the comment has tags. */
    docLines: string[];
};

/**
 * Returns a synthetic doc comment payload for a static variable declaration,
 * or null when no doc comment should be generated.
 *
 * This is a placeholder for future implementation. Static variable synthetic
 * doc comments will be derived from surrounding comments in the source when
 * this feature is implemented.
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
 * Returns a synthetic doc comment payload for a function assignment
 * (e.g., `myFunc = function() { ... }`), or null when no doc comment
 * should be generated.
 *
 * This is a placeholder for future implementation. Function assignment
 * synthetic doc comments will be derived from surrounding comments in
 * the source when this feature is implemented.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    _statement: unknown,
    _options: unknown,
    _programNode: unknown,
    _originalText: unknown
): SyntheticDocCommentPayload | null {
    return null;
}
