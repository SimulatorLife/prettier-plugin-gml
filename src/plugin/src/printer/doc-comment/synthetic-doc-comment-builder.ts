import { Core } from "@gml-modules/core";
import { type Doc } from "prettier";

import { hardline, join } from "../prettier-doc-builders.js";

const { isObjectLike } = Core;

type ComputeSyntheticDocComment = typeof Core.computeSyntheticDocComment;
type ComputeSyntheticDocCommentForStaticVariable = typeof Core.computeSyntheticDocCommentForStaticVariable;
type ComputeSyntheticDocCommentForFunctionAssignment = typeof Core.computeSyntheticDocCommentForFunctionAssignment;

export type SyntheticDocComment = NonNullable<ReturnType<ComputeSyntheticDocComment>>;

export type SyntheticDocCommentDoc = SyntheticDocComment & { doc: Doc };

export type SyntheticDocCommentPayload = {
    doc: Doc | null;
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: Doc[];
};

type SyntheticDocCommentCoreResult =
    | NonNullable<ReturnType<ComputeSyntheticDocCommentForStaticVariable>>
    | NonNullable<ReturnType<ComputeSyntheticDocCommentForFunctionAssignment>>;

type SyntheticDocCommentCache = {
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: unknown;
};

export function buildSyntheticDocComment(
    functionNode: unknown,
    existingDocLines: string[],
    options: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
    computeSyntheticDocComment: ComputeSyntheticDocComment = Core.computeSyntheticDocComment
): SyntheticDocCommentDoc | null {
    const syntheticDocComment = computeSyntheticDocComment(functionNode, existingDocLines, options, overrides);

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
        doc: join(hardline, syntheticDocComment.docLines)
    };
}

function normalizePlainLeadingLines(lines: unknown): Doc[] {
    return Core.asArray(lines);
}

function buildDocFromSyntheticResult(result: SyntheticDocCommentCoreResult | null): SyntheticDocCommentDoc | null {
    if (!result?.docLines) {
        return null;
    }

    const syntheticDocLines = Core.isNonEmptyArray(result.docLines) ? result.docLines : null;

    if (!syntheticDocLines) {
        return null;
    }

    return buildSyntheticDocCommentDoc({
        docLines: syntheticDocLines,
        hasExistingDocLines: result.hasExistingDocLines === true
    });
}

function readSyntheticDocCommentCache(node: unknown): SyntheticDocCommentCache | null {
    if (!isObjectLike(node)) {
        return null;
    }

    const cache = (node as { _gmlSyntheticDocComment?: unknown })._gmlSyntheticDocComment;
    if (!isObjectLike(cache)) {
        return null;
    }

    const rawDocLines = Array.isArray((cache as { docLines?: unknown }).docLines)
        ? (cache as { docLines: unknown[] }).docLines
        : null;
    const docLines = rawDocLines ? rawDocLines.filter((line): line is string => typeof line === "string") : null;
    const hasExistingDocLines = (cache as { hasExistingDocLines?: boolean }).hasExistingDocLines === true;
    const plainLeadingLines = (cache as { plainLeadingLines?: unknown }).plainLeadingLines ?? [];

    if (!Core.isNonEmptyArray(docLines) && Core.asArray(plainLeadingLines).length === 0) {
        return null;
    }

    return {
        docLines: Core.isNonEmptyArray(docLines) ? docLines : null,
        hasExistingDocLines,
        plainLeadingLines
    };
}

function resolveDocCommentPayloadFromCache(cache: SyntheticDocCommentCache): SyntheticDocCommentPayload | null {
    const docLines = Core.isNonEmptyArray(cache.docLines) ? cache.docLines : null;
    const doc = docLines
        ? buildSyntheticDocCommentDoc({
              docLines,
              hasExistingDocLines: cache.hasExistingDocLines
          })
        : null;
    const plainLeadingLines = normalizePlainLeadingLines(cache.plainLeadingLines);

    if (!doc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        doc: doc?.doc ?? null,
        docLines: doc?.docLines ?? null,
        hasExistingDocLines: cache.hasExistingDocLines,
        plainLeadingLines
    };
}

function resolveDocCommentPayload(result: SyntheticDocCommentCoreResult | null): SyntheticDocCommentPayload | null {
    if (!result) {
        return null;
    }

    const doc = buildDocFromSyntheticResult(result);
    const plainLeadingLines = normalizePlainLeadingLines(result.plainLeadingLines);

    if (!doc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        doc: doc?.doc ?? null,
        docLines: doc?.docLines ?? null,
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
    const cached = readSyntheticDocCommentCache(node);
    if (cached) {
        return resolveDocCommentPayloadFromCache(cached);
    }

    const result = Core.computeSyntheticDocCommentForStaticVariable(node, options, programNode, sourceText);

    return resolveDocCommentPayload(result);
}

export function getSyntheticDocCommentForFunctionAssignment(
    node: unknown,
    options: Record<string, unknown>,
    programNode: unknown,
    sourceText: string | null | undefined
): SyntheticDocCommentPayload | null {
    const cached = readSyntheticDocCommentCache(node);
    if (cached) {
        return resolveDocCommentPayloadFromCache(cached);
    }

    const result = Core.computeSyntheticDocCommentForFunctionAssignment(node, options, programNode, sourceText);

    return resolveDocCommentPayload(result);
}
