import type { MutableGameMakerAstNode } from "@gml-modules/core";

/** Shape of a precomputed synthetic doc comment record attached to a statement node. */
export type SyntheticDocCommentPayload = {
    plainLeadingLines: string[];
    doc: unknown;
    docLines: string[] | null;
    hasExistingDocLines: boolean;
};

/**
 * Retrieves a precomputed synthetic doc comment for a static variable declaration.
 * Returns null when no synthetic doc comment applies.
 */
export function getSyntheticDocCommentForStaticVariable(
    _node: MutableGameMakerAstNode,
    _options: unknown,
    _programNode: MutableGameMakerAstNode | null,
    _originalText: string | null
): SyntheticDocCommentPayload | null {
    return null;
}

/**
 * Retrieves a precomputed synthetic doc comment for a function assignment statement.
 * Returns null when no synthetic doc comment applies.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    _node: MutableGameMakerAstNode,
    _options: unknown,
    _programNode: MutableGameMakerAstNode | null,
    _originalText: string | null
): SyntheticDocCommentPayload | null {
    return null;
}
