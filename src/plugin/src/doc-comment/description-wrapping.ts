import type { MutableDocCommentLines } from "@gml-modules/core";

const STRING_TYPE = "string";
const DESCRIPTION_LINE_PATTERN = /^(\s*\/\/\/\s*@description\s+)(.*)$/i;

function wrapDescriptionContent(
    content: string,
    firstLimit: number,
    continuationLimit: number
): string[] {
    const words = content.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
        return [""];
    }

    const segments: string[] = [];
    let current = words[0];
    let currentLimit = firstLimit;

    for (let index = 1; index < words.length; index += 1) {
        const word = words[index];
        const nextLength = current.length + 1 + word.length;
        if (nextLength <= currentLimit) {
            current = `${current} ${word}`;
            continue;
        }

        segments.push(current);
        current = word;
        currentLimit = continuationLimit;
    }

    if (current.length > 0) {
        segments.push(current);
    }

    return segments;
}

export function wrapDocDescriptionLines(
    docCommentDocs: MutableDocCommentLines,
    wrapWidth: number
): MutableDocCommentLines {
    if (
        Array.isArray(docCommentDocs) &&
        (docCommentDocs as any)._preserveDescriptionBreaks === true
    ) {
        return docCommentDocs;
    }

    if (
        !Array.isArray(docCommentDocs) ||
        typeof wrapWidth !== "number" ||
        !Number.isFinite(wrapWidth)
    ) {
        return docCommentDocs;
    }

    for (let index = 0; index < docCommentDocs.length; index += 1) {
        const entry = docCommentDocs[index];
        if (typeof entry !== STRING_TYPE) {
            continue;
        }

        const match = entry.match(DESCRIPTION_LINE_PATTERN);
        if (!match) {
            continue;
        }

        const [, prefix, content] = match;
        const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;

        const firstLineLimit = Math.max(wrapWidth - prefix.length, 0);
        const continuationLimit = Math.max(
            wrapWidth - continuationPrefix.length,
            0
        );

        if (firstLineLimit <= 0 || continuationLimit <= 0) {
            continue;
        }

        let lookahead = index + 1;
        const continuationFragments: string[] = [];

        while (lookahead < docCommentDocs.length) {
            const candidate = docCommentDocs[lookahead];
            if (typeof candidate !== STRING_TYPE) {
                break;
            }

            const trimmed = candidate.trim();
            if (!trimmed.startsWith("///")) {
                break;
            }

            if (/^\/\/\/\s*@/.test(trimmed)) {
                break;
            }

            const suffix = trimmed.slice(3).trim();
            if (suffix.length === 0) {
                lookahead += 1;
                continuationFragments.push("");
                continue;
            }

            continuationFragments.push(suffix);
            lookahead += 1;
        }

        const combinedContent = [content, ...continuationFragments]
            .filter((segment) => segment.length > 0)
            .join(" ")
            .trim();

        if (combinedContent.length === 0) {
            continue;
        }

        const segments = wrapDescriptionContent(
            combinedContent,
            firstLineLimit,
            continuationLimit
        );
        if (segments.length <= 1 && continuationFragments.length === 0) {
            continue;
        }

        const wrappedLines = [prefix + segments[0]];
        for (let lineIndex = 1; lineIndex < segments.length; lineIndex += 1) {
            wrappedLines.push(continuationPrefix + segments[lineIndex]);
        }

        const replaceCount = lookahead - index;
        docCommentDocs.splice(index, replaceCount, ...wrappedLines);
        index += wrappedLines.length - 1;
    }

    return docCommentDocs;
}
