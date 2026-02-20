import { type MutableGameMakerAstNode } from "@gml-modules/core";
import { type Doc } from "prettier";

export type SyntheticDocCommentPayload = {
    plainLeadingLines: string[];
    doc: Doc | null;
    docLines: string[] | null;
};

/**
 * Attempts to produce a synthetic doc comment for a static variable declaration
 * (e.g., `static foo = function() {}`). Returns null if the node does not match
 * or no synthetic comment can be generated.
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
 * Attempts to produce a synthetic doc comment for a function assignment
 * (e.g., `foo = function() {}`). Returns null if the node does not match or
 * no synthetic comment can be generated.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    _node: MutableGameMakerAstNode,
    _options: unknown,
    _programNode: MutableGameMakerAstNode | null,
    _originalText: string | null
): SyntheticDocCommentPayload | null {
    return null;
}
