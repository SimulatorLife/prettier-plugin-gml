import { type Doc } from "prettier";

// Synthetic doc-comment content generation is lint-owned (`gml/normalize-doc-comments`).
// The formatter keeps this API as a compatibility seam but never emits synthetic payloads.
export type SyntheticDocCommentPayload = Readonly<{
    doc: Doc | null;
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: Doc[];
}>;

function ignoreSyntheticDocCommentInputs(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): void {
    void node;
    void options;
    void programNode;
    void sourceText;
}

export function getSyntheticDocCommentForStaticVariable(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    ignoreSyntheticDocCommentInputs(node, options, programNode, sourceText);
    return null;
}

export function getSyntheticDocCommentForFunctionAssignment(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    return getSyntheticDocCommentForStaticVariable(node, options, programNode, sourceText);
}
