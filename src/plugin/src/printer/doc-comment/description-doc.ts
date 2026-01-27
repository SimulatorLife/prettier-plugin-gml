import { type MutableDocCommentLines } from "@gml-modules/core";
import { type Doc } from "prettier";

import { DescriptionUtils } from "../../transforms/doc-comment/index.js";
import { align, concat, group, hardline, join } from "../prettier-doc-builders.js";

const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

function collectDescriptionContinuations(lines: MutableDocCommentLines, startIndex: number) {
    const continuations: string[] = [];
    let lookahead = startIndex + 1;

    while (lookahead < lines.length) {
        const candidate = lines[lookahead];
        const classification = DescriptionUtils.classifyDescriptionContinuationLine(candidate);
        if (classification.kind === "stop") {
            break;
        }

        if (classification.kind === "empty") {
            continuations.push("");
            lookahead += 1;
            continue;
        }

        continuations.push(classification.suffix);
        lookahead += 1;
    }

    return { continuations, linesConsumed: lookahead - startIndex };
}

function buildDescriptionDoc(lineText: string, continuations: string[]): Doc {
    const trimmedLine = lineText.trim();
    const descriptionText = trimmedLine.replace(DESCRIPTION_TAG_PATTERN, "").trim();

    const { prefix } = DescriptionUtils.resolveDescriptionIndentation(lineText);
    const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

    const lines = [descriptionText, ...continuations];

    return group(concat([prefix, align(continuationPrefix, join(hardline, lines))]));
}

/**
 * Convert doc comment lines into Prettier {@link Doc} nodes.
 */
export function buildPrintableDocCommentLines(docCommentDocs: MutableDocCommentLines): Doc[] {
    const result: Doc[] = [];
    let index = 0;

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

        result.push(buildDescriptionDoc(entry, continuations));
        index += linesConsumed;
    }

    return result;
}
