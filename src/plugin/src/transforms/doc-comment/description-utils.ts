import type { MutableDocCommentLines } from "@gml-modules/core";

const STRING_TYPE = "string";
export const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

export function resolveDescriptionIndentation(line: string) {
    const trimmedStart = line.trimStart();
    const indent = line.slice(0, line.length - trimmedStart.length);
    const prefixMatch = trimmedStart.match(/^(\/\/\/\s*@description\s+)/i);
    const prefix = prefixMatch ? prefixMatch[1] : "/// @description ";
    return { indent, prefix };
}

function formatDescriptionContinuationLine(
    line: string,
    continuationPrefix: string
): string | null {
    if (typeof line !== STRING_TYPE) {
        return null;
    }

    const trimmed = line.trim();
    if (!trimmed.startsWith("///")) {
        return null;
    }

    if (/^\/\/\/\s*@/.test(trimmed)) {
        return null;
    }

    const docLikeMatch = trimmed.match(/^\/\/\/\s*\/\s*(.*)$/);
    const suffix = docLikeMatch
        ? (docLikeMatch[1] ?? "").trim()
        : trimmed.slice(3).replace(/^\s+/, "");
    if (suffix.length === 0) {
        return null;
    }

    const normalizedPrefix = continuationPrefix.trimStart();
    if (trimmed.startsWith(normalizedPrefix)) {
        return line;
    }

    return `${continuationPrefix}${suffix}`;
}

export function collectDescriptionContinuations(
    docCommentDocs: MutableDocCommentLines | readonly unknown[]
): string[] {
    if (!Array.isArray(docCommentDocs)) {
        return [];
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) =>
            typeof line === STRING_TYPE &&
            DESCRIPTION_TAG_PATTERN.test(line.trim())
    );

    if (descriptionIndex === -1) {
        return [];
    }

    const continuations: string[] = [];

    for (
        let index = descriptionIndex + 1;
        index < docCommentDocs.length;
        index += 1
    ) {
        const line = docCommentDocs[index];

        if (typeof line !== STRING_TYPE) {
            break;
        }

        if (!line.trim().startsWith("///")) {
            break;
        }

        if (/^\/\/\/\s*@/.test(line.trim())) {
            break;
        }

        const suffix = line.trim().slice(3).trim();
        if (suffix.length === 0) {
            continue;
        }

        continuations.push(line);
    }

    return continuations;
}

export function applyDescriptionContinuations(
    docCommentDocs: MutableDocCommentLines,
    continuations: string[]
): MutableDocCommentLines {
    if (!Array.isArray(docCommentDocs) || continuations.length === 0) {
        return docCommentDocs;
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) =>
            typeof line === STRING_TYPE &&
            DESCRIPTION_TAG_PATTERN.test(line.trim())
    );

    if (descriptionIndex === -1) {
        return docCommentDocs;
    }

    const descriptionLine = docCommentDocs[descriptionIndex];
    if (typeof descriptionLine !== STRING_TYPE) {
        return docCommentDocs;
    }

    const continuationPrefix = "/// ";

    let insertIndex = descriptionIndex + 1;

    for (const original of continuations) {
        const formatted = formatDescriptionContinuationLine(
            original,
            continuationPrefix
        );

        if (!formatted) {
            continue;
        }

        const normalized = formatted.trim();
        const alreadyExists = docCommentDocs.some(
            (line) => typeof line === STRING_TYPE && line.trim() === normalized
        );

        if (alreadyExists) {
            continue;
        }

        docCommentDocs.splice(insertIndex, 0, formatted);
        insertIndex += 1;
    }

    if (continuations.length > 0) {
        (docCommentDocs as any)._preserveDescriptionBreaks = true;
    }

    return docCommentDocs;
}

export function ensureDescriptionContinuations(
    docCommentDocs: MutableDocCommentLines
) {
    if (!Array.isArray(docCommentDocs)) {
        return;
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) =>
            typeof line === STRING_TYPE &&
            DESCRIPTION_TAG_PATTERN.test(line.trim())
    );

    if (descriptionIndex === -1) {
        return;
    }

    const descriptionLine = docCommentDocs[descriptionIndex];
    if (typeof descriptionLine !== STRING_TYPE) {
        return;
    }

    const continuationPrefix = "/// ";

    let foundContinuation = false;

    for (
        let index = descriptionIndex + 1;
        index < docCommentDocs.length;
        index += 1
    ) {
        const line = docCommentDocs[index];

        if (typeof line !== STRING_TYPE) {
            break;
        }

        const trimmed = line.trim();
        if (!trimmed.startsWith("///")) {
            break;
        }

        if (/^\/\/\/\s*@/.test(trimmed)) {
            break;
        }

        const formatted = formatDescriptionContinuationLine(
            line,
            continuationPrefix
        );
        if (!formatted) {
            continue;
        }

        docCommentDocs[index] = formatted;
        foundContinuation = true;
    }

    if (foundContinuation) {
        (docCommentDocs as any)._preserveDescriptionBreaks = true;
    }
}
