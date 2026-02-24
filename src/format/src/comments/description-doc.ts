import { Core, type MutableDocCommentLines } from "@gml-modules/core";
import { type Doc } from "prettier";

import { align, concat, group, hardline, join } from "../printer/prettier-doc-builders.js";

const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;
const DOC_TAG_PATTERN = /^\/\/\/\s*@/i;

function getDocCommentIndentSpaces(line: string): number {
    const match = line.match(/^\s*\/\/\/([ \t]*)/);
    if (!match) {
        return 0;
    }

    return match[1].replaceAll("\t", "    ").length;
}

function collectDescriptionContinuations(lines: MutableDocCommentLines, startIndex: number, baseIndentSpaces: number) {
    const continuations: string[] = [];
    let lookahead = startIndex + 1;

    while (lookahead < lines.length) {
        const candidate = lines[lookahead];
        const classification = Core.classifyDescriptionContinuationLine(candidate);
        if (classification.kind === "stop") {
            break;
        }

        if (classification.kind === "empty") {
            continuations.push("");
            lookahead += 1;
            continue;
        }

        if (typeof candidate === "string") {
            const indentSpaces = getDocCommentIndentSpaces(candidate);
            const extraIndent = Math.max(0, indentSpaces - baseIndentSpaces);
            continuations.push(`${" ".repeat(extraIndent)}${classification.suffix}`);
        } else {
            continuations.push(classification.suffix);
        }
        lookahead += 1;
    }

    return { continuations, linesConsumed: lookahead - startIndex };
}

function buildDescriptionDoc(lineText: string, continuations: string[]): Doc {
    const trimmedLine = lineText.trim();
    const descriptionText = trimmedLine.replace(DESCRIPTION_TAG_PATTERN, "").trim();

    const { prefix } = Core.resolveDescriptionIndentation(lineText);
    const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

    const lines = [descriptionText, ...continuations];

    return group(concat([prefix, align(continuationPrefix, join(hardline, lines))]));
}

function isDescriptionTagLine(entry: MutableDocCommentLines[number]): boolean {
    return typeof entry === "string" && DESCRIPTION_TAG_PATTERN.test(entry.trim());
}

function isDescriptionContinuationLine(entry: MutableDocCommentLines[number]): boolean {
    if (typeof entry !== "string") {
        return false;
    }

    const trimmed = entry.trim();
    if (!trimmed.startsWith("///")) {
        return false;
    }

    return !DOC_TAG_PATTERN.test(trimmed);
}

function coerceDocCommentEntriesToRawLines(docCommentDocs: MutableDocCommentLines): void {
    for (let index = 0; index < docCommentDocs.length; index += 1) {
        const entry = docCommentDocs[index];
        if (typeof entry === "string") {
            continue;
        }

        const rawText = Core.getLineCommentRawText(entry, {});
        if (rawText !== null) {
            docCommentDocs[index] = rawText;
        }
    }
}

function reorderMisplacedDescriptionContinuations(docCommentDocs: MutableDocCommentLines): void {
    for (let index = 1; index < docCommentDocs.length; index += 1) {
        if (!isDescriptionTagLine(docCommentDocs[index])) {
            continue;
        }

        let insertionIndex = index;
        while (insertionIndex > 0 && isDescriptionContinuationLine(docCommentDocs[insertionIndex - 1])) {
            insertionIndex -= 1;
        }

        if (insertionIndex === index) {
            continue;
        }

        const [descriptionLine] = docCommentDocs.splice(index, 1);
        docCommentDocs.splice(insertionIndex, 0, descriptionLine);
    }
}

/**
 * Convert doc comment lines into Prettier {@link Doc} nodes.
 */
export function buildPrintableDocCommentLines(docCommentDocs: MutableDocCommentLines): Doc[] {
    coerceDocCommentEntriesToRawLines(docCommentDocs);
    reorderMisplacedDescriptionContinuations(docCommentDocs);

    const result: Doc[] = [];
    let index = 0;

    while (index < docCommentDocs.length) {
        const entry = docCommentDocs[index];
        if (typeof entry !== "string") {
            // Convert AST comment nodes to their raw text representation before processing.
            // Leaving them as objects causes Prettier's printer to crash.
            const rawText = Core.getLineCommentRawText(entry, {});
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
        const { continuations, linesConsumed } = collectDescriptionContinuations(
            docCommentDocs,
            index,
            baseIndentSpaces
        );

        result.push(buildDescriptionDoc(entry, continuations));
        index += linesConsumed;
    }

    return result;
}
