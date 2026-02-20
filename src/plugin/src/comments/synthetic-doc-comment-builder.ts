import { type Doc } from "prettier";

/**
 * Payload returned when a synthetic doc comment is generated for a statement node.
 * This carries the formatted doc, its raw lines, any plain leading method list lines,
 * and whether the node already had existing doc lines attached before synthesis.
 */
export type SyntheticDocCommentPayload = {
    /** Formatted Prettier Doc for the synthetic doc comment block. */
    doc: Doc;
    /** Raw doc-comment lines used to build the doc. */
    docLines: string[] | null;
    /** Plain method-list leading lines that precede the doc comment. */
    plainLeadingLines: string[];
    /** Whether the node already had explicit doc lines before synthesis. */
    hasExistingDocLines: boolean;
};

/**
 * Attempt to generate a synthetic doc comment for a function assignment statement.
 * Returns null if the statement is not a function assignment or has no synthesizable doc.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    _statement: unknown,
    _options: unknown,
    _programNode: unknown,
    _originalText: unknown
): SyntheticDocCommentPayload | null {
    return null;
}

/**
 * Attempt to generate a synthetic doc comment for a static variable declaration.
 * Returns null if the statement is not a static declaration or has no synthesizable doc.
 */
export function getSyntheticDocCommentForStaticVariable(
    _statement: unknown,
    _options: unknown,
    _programNode: unknown,
    _originalText: unknown
): SyntheticDocCommentPayload | null {
    return null;
}
