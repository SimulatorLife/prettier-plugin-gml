import { Core } from "@gml-modules/core";
import { type Doc } from "prettier";

import { concat, hardline, join } from "../prettier-doc-builders.js";

type ComputeSyntheticDocComment = typeof Core.computeSyntheticDocComment;
type ComputeSyntheticDocCommentForStaticVariable =
    typeof Core.computeSyntheticDocCommentForStaticVariable;
type ComputeSyntheticDocCommentForFunctionAssignment =
    typeof Core.computeSyntheticDocCommentForFunctionAssignment;

export type SyntheticDocComment = NonNullable<
    ReturnType<ComputeSyntheticDocComment>
>;

export type SyntheticDocCommentDoc = SyntheticDocComment & { doc: Doc };

export type SyntheticDocCommentPayload = {
    doc: Doc | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: Doc[];
};

type SyntheticDocCommentCoreResult =
    | NonNullable<ReturnType<ComputeSyntheticDocCommentForStaticVariable>>
    | NonNullable<ReturnType<ComputeSyntheticDocCommentForFunctionAssignment>>;

const isNonEmptyStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0;

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
        doc: concat([join(hardline, syntheticDocComment.docLines)])
    };
}

function normalizePlainLeadingLines(lines: unknown): Doc[] {
    return Array.isArray(lines) ? (lines as Doc[]) : [];
}

function buildDocFromSyntheticResult(
    result: SyntheticDocCommentCoreResult | null
): SyntheticDocCommentDoc | null {
    if (!result?.docLines) {
        return null;
    }

    const syntheticDocLines = isNonEmptyStringArray(result.docLines)
        ? result.docLines
        : null;

    if (!syntheticDocLines) {
        return null;
    }

    return buildSyntheticDocCommentDoc({
        docLines: syntheticDocLines,
        hasExistingDocLines: result.hasExistingDocLines === true
    });
}

function resolveDocCommentPayload(
    result: SyntheticDocCommentCoreResult | null
): SyntheticDocCommentPayload | null {
    if (!result) {
        return null;
    }

    const doc = buildDocFromSyntheticResult(result);
    const plainLeadingLines = normalizePlainLeadingLines(
        result.plainLeadingLines
    );

    if (!doc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        doc: doc?.doc ?? null,
        hasExistingDocLines: result.hasExistingDocLines === true,
        plainLeadingLines
    };
}

export function getSyntheticDocCommentForStaticVariable(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    const result = Core.computeSyntheticDocCommentForStaticVariable(
        node,
        options,
        programNode,
        sourceText
    );

    return resolveDocCommentPayload(result);
}

export function getSyntheticDocCommentForFunctionAssignment(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    const result = Core.computeSyntheticDocCommentForFunctionAssignment(
        node,
        options,
        programNode,
        sourceText
    );

    return resolveDocCommentPayload(result);
}
