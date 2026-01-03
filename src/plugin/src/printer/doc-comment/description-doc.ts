import { doc, type Doc } from "prettier";
import { concat, fill, group, line } from "../prettier-doc-builders.js";
import { resolveDescriptionIndentation } from "../../transforms/doc-comment/description-utils.js";

import type { MutableDocCommentLines } from "@gml-modules/core";

const { printer } = doc;
const { printDocToString } = printer;
const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

function collectDescriptionContinuations(
    lines: MutableDocCommentLines,
    startIndex: number
) {
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

function wrapDescriptionWithPrettier(
    indent: string,
    prefix: string,
    continuationPrefix: string,
    contentWords: string[],
    printWidth: number
) {
    const prefixText = `${indent}${prefix}`;
    const formattedWidth = Math.max(
        1,
        printWidth - prefixText.length
    );

    const segments = contentWords.map((word) => concat([word, line]));
    const textDoc: Doc = group(fill(segments));
    const printed = printDocToString(textDoc, {
        printWidth: formattedWidth,
        tabWidth: 4,
        useTabs: false
    });
    const formatted = printed.formatted.trim();

    if (formatted.length === 0) {
        return [prefixText.trim()];
    }

    return formatted.split("\n").map((lineText, index) => {
        const trimmed = lineText.trim();
        if (index === 0) {
            return `${prefixText}${trimmed}`;
        }
        return `${continuationPrefix}${trimmed}`;
    });
}

function buildDescriptionLines(
    line: string,
    continuations: string[],
    printWidth: number
) {
    const trimmedLine = line.trim();
    const descriptionText = trimmedLine
        .replace(DESCRIPTION_TAG_PATTERN, "")
        .trim();

    const { indent, prefix } = resolveDescriptionIndentation(line);
    const continuationPrefix = `${indent}/// ${" ".repeat(
        Math.max(prefix.length - 4, 0)
    )}`;

    const fragments = [descriptionText, ...continuations]
        .filter(Boolean)
        .join(" ");

    const contentWords = fragments
        .split(/\s+/)
        .filter((word) => word.length > 0);

    if (contentWords.length === 0) {
        return [line];
    }

    return wrapDescriptionWithPrettier(
        indent,
        prefix,
        continuationPrefix,
        contentWords,
        printWidth
    );
}

export function buildPrintableDocCommentLines(
    docCommentDocs: MutableDocCommentLines,
    printWidth: number
): string[] {
    const result: string[] = [];
    let index = 0;

    while (index < docCommentDocs.length) {
        const entry = docCommentDocs[index];
        if (typeof entry !== "string") {
            result.push(entry);
            index += 1;
            continue;
        }

        const trimmed = entry.trim();
        if (!DESCRIPTION_TAG_PATTERN.test(trimmed)) {
            result.push(entry);
            index += 1;
            continue;
        }

        const { continuations, linesConsumed } =
            collectDescriptionContinuations(docCommentDocs, index);
        const wrappedLines = buildDescriptionLines(
            entry,
            continuations,
            printWidth
        );

        result.push(...wrappedLines);
        index += linesConsumed;
    }

    return result;
}
