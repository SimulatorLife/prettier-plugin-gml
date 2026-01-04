import { type Doc } from "prettier";
import { align, concat, fill, group, hardline, join, line } from "../prettier-doc-builders.js";
import { resolveDescriptionIndentation } from "../../transforms/doc-comment/description-utils.js";

import { Core, type MutableDocCommentLines } from "@gml-modules/core";

const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

function collectDescriptionContinuations(lines: MutableDocCommentLines, startIndex: number) {
    const continuations: string[] = [];
    let lookahead = startIndex + 1;

    while (lookahead < lines.length) {
        const candidate = lines[lookahead];
        if (typeof candidate !== "string") {
            break;
        }

        const trimmed = candidate.trim();
        if (!trimmed.startsWith("///")) {
            break;
        }

        if (/^\/\/\/\s*@/.test(trimmed)) {
            break;
        }

        continuations.push(trimmed.slice(3).trim());
        lookahead += 1;
    }

    return { continuations, linesConsumed: lookahead - startIndex };
}

function buildDescriptionDoc(lineText: string, continuations: string[]): Doc {
    const trimmedLine = lineText.trim();
    const descriptionText = trimmedLine.replace(DESCRIPTION_TAG_PATTERN, "").trim();

    const { prefix } = resolveDescriptionIndentation(lineText);
    const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

    const fragments = Core.compactArray([descriptionText, ...continuations]).join(" ");

    const contentWords = fragments.split(/\s+/).filter((word) => word.length > 0);

    if (contentWords.length === 0) {
        return lineText.trim();
    }

    const segments: Doc[] = [];
    for (let i = 0; i < contentWords.length; i++) {
        segments.push(contentWords[i]);
        if (i < contentWords.length - 1) {
            segments.push(line);
        }
    }

    return group(concat([prefix, align(continuationPrefix, fill(segments))]));
}

/**
 * Convert doc comment lines into Prettier {@link Doc} nodes, ensuring that
 * `@description` blocks are wrapped using Prettier's built-in algorithms.
 */
export function buildPrintableDocCommentLines(docCommentDocs: MutableDocCommentLines, _printWidth: number): Doc[] {
    const result: Doc[] = [];
    let index = 0;

    const preserveBreaks = (docCommentDocs as any)._preserveDescriptionBreaks === true;

    while (index < docCommentDocs.length) {
        const entry = docCommentDocs[index];
        if (typeof entry !== "string") {
            result.push(entry as Doc);
            index += 1;
            continue;
        }

        const trimmed = entry.trim();
        if (!DESCRIPTION_TAG_PATTERN.test(trimmed)) {
            result.push(trimmed);
            index += 1;
            continue;
        }

        const { continuations, linesConsumed } = collectDescriptionContinuations(docCommentDocs, index);

        if (preserveBreaks) {
            const { prefix } = resolveDescriptionIndentation(entry);
            const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

            const descriptionText = entry.trim().replace(DESCRIPTION_TAG_PATTERN, "").trim();

            const lines = [descriptionText, ...continuations];

            result.push(group(concat([prefix, align(continuationPrefix, join(hardline, lines))])));
        } else {
            result.push(buildDescriptionDoc(entry, continuations));
        }
        index += linesConsumed;
    }

    return result;
}
