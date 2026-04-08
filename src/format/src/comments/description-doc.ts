import { Core, type MutableDocCommentLines } from "@gmloop/core";
import { type Doc } from "prettier";

import { align, concat, group, hardline, join } from "../printer/prettier-doc-builders.js";

const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

function buildDescriptionDoc(lineText: string, continuations: string[]): Doc {
    const trimmedLine = lineText.trim();
    const descriptionText = trimmedLine.replace(DESCRIPTION_TAG_PATTERN, "").trim();

    const { prefix } = Core.resolveDescriptionIndentation(lineText);
    const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

    const lines = [descriptionText, ...continuations];

    return group(concat([prefix, align(continuationPrefix, join(hardline, lines))]));
}

function coerceDocCommentEntriesToRawLines(docCommentDocs: MutableDocCommentLines, originalText: string | null): void {
    for (let index = 0; index < docCommentDocs.length; index += 1) {
        const entry = docCommentDocs[index];
        if (typeof entry === "string") {
            continue;
        }

        const rawText = Core.getLineCommentRawText(entry, { originalText: originalText ?? undefined });
        if (rawText !== null) {
            docCommentDocs[index] = rawText;
        }
    }
}

/**
 * Convert doc comment lines into Prettier {@link Doc} nodes.
 */
export function buildPrintableDocCommentLines(
    docCommentDocs: MutableDocCommentLines,
    originalText: string | null
): Doc[] {
    coerceDocCommentEntriesToRawLines(docCommentDocs, originalText);

    const result: Doc[] = [];
    let index = 0;

    while (index < docCommentDocs.length) {
        const entry = docCommentDocs[index];
        if (typeof entry !== "string") {
            // Convert AST comment nodes to their raw text representation before processing.
            // Leaving them as objects causes Prettier's printer to crash.
            const rawText = Core.getLineCommentRawText(entry, { originalText: originalText ?? undefined });
            if (rawText !== null) {
                docCommentDocs[index] = rawText;
                continue;
            }
            index += 1;
            continue;
        }

        const trimmed = entry.trim();
        if (!DESCRIPTION_TAG_PATTERN.test(trimmed)) {
            result.push(trimmed);
            index += 1;
            continue;
        }

        const { prefix } = Core.resolveDescriptionIndentation(entry);
        const baseIndentSpaces = Math.max(prefix.length - 3, 0);
        const { continuations, linesConsumed } = Core.collectDescriptionContinuationText(
            docCommentDocs,
            index,
            baseIndentSpaces
        );

        result.push(buildDescriptionDoc(entry, continuations));
        index += linesConsumed;
    }

    return result;
}
