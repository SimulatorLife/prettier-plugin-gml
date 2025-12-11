import { Core } from "@gml-modules/core";
import { type Doc } from "prettier";

import { concat, hardline, join } from "../doc-builders.js";

type ComputeSyntheticDocComment = typeof Core.computeSyntheticDocComment;

export type SyntheticDocComment = NonNullable<
    ReturnType<ComputeSyntheticDocComment>
>;

export type SyntheticDocCommentDoc = SyntheticDocComment & { doc: Doc };

export function buildSyntheticDocComment(
    functionNode: unknown,
    existingDocLines: string[],
    options: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
    computeSyntheticDocComment: ComputeSyntheticDocComment = Core.computeSyntheticDocComment
): SyntheticDocCommentDoc | null {
    const syntheticDocComment = computeSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        overrides
    );

    return buildSyntheticDocCommentDoc(syntheticDocComment);
}

export function buildSyntheticDocCommentDoc(
    syntheticDocComment: SyntheticDocComment | null
): SyntheticDocCommentDoc | null {
    if (!syntheticDocComment) {
        return null;
    }

    return {
        ...syntheticDocComment,
        doc: concat([hardline, join(hardline, syntheticDocComment.docLines)])
    };
}
