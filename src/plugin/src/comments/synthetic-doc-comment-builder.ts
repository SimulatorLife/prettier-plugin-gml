import { Core, type MutableDocCommentLines } from "@gml-modules/core";
import { type Doc } from "prettier";

import { hardline, join } from "../printer/prettier-doc-builders.js";
import { buildPrintableDocCommentLines } from "./description-doc.js";

export type SyntheticDocCommentPayload = {
    doc: Doc;
    docLines: string[] | null;
    plainLeadingLines: string[];
    hasExistingDocLines: boolean;
};

function buildDocFromLines(docLines: string[] | null): Doc {
    if (!Core.isNonEmptyArray(docLines)) {
        return "";
    }
    const mutableLines = docLines as MutableDocCommentLines;
    return join(hardline, buildPrintableDocCommentLines(mutableLines));
}

/**
 * Computes a synthetic doc comment for a `static` variable declaration and
 * returns a {@link SyntheticDocCommentPayload} if one can be generated.
 */
export function getSyntheticDocCommentForStaticVariable(
    node: unknown,
    options: unknown,
    programNode: unknown,
    sourceText: string | null
): SyntheticDocCommentPayload | null {
    const result = Core.computeSyntheticDocCommentForStaticVariable(node, options, programNode, sourceText);
    if (!result) {
        return null;
    }
    return {
        doc: buildDocFromLines(result.docLines),
        docLines: result.docLines,
        plainLeadingLines: result.plainLeadingLines,
        hasExistingDocLines: result.hasExistingDocLines
    };
}

/**
 * Computes a synthetic doc comment for a function assignment expression and
 * returns a {@link SyntheticDocCommentPayload} if one can be generated.
 */
export function getSyntheticDocCommentForFunctionAssignment(
    node: unknown,
    options: unknown,
    programNode: unknown,
    sourceText: string | null
): SyntheticDocCommentPayload | null {
    const result = Core.computeSyntheticDocCommentForFunctionAssignment(node, options, programNode, sourceText);
    if (!result) {
        return null;
    }
    return {
        doc: buildDocFromLines(result.docLines),
        docLines: result.docLines,
        plainLeadingLines: result.plainLeadingLines,
        hasExistingDocLines: result.hasExistingDocLines
    };
}
