import { Core, type MutableDocCommentLines } from "@gml-modules/core";

const STRING_TYPE = "string";

/**
 * Outcome of evaluating a potential `@description` continuation line.
 */
export type DescriptionContinuationLineClassification =
    | {
          kind: "stop";
      }
    | {
          kind: "empty";
          trimmedLine: string;
      }
    | {
          kind: "text";
          originalLine: string;
          trimmedLine: string;
          suffix: string;
      };

/**
 * Classify a doc-comment line following `@description` to determine whether it
 * continues the description text, should be skipped, or signals a stop.
 */
export function classifyDescriptionContinuationLine(line: unknown): DescriptionContinuationLineClassification {
    if (typeof line !== "string") {
        return { kind: "stop" };
    }

    const trimmedLine = line.trim();

    if (!trimmedLine.startsWith("///")) {
        return { kind: "stop" };
    }

    if (/^\/\/\/\s*@/.test(trimmedLine)) {
        return { kind: "stop" };
    }

    const suffix = trimmedLine.slice(3).trim();

    if (suffix.length === 0) {
        return { kind: "empty", trimmedLine };
    }

    return {
        kind: "text",
        originalLine: line,
        trimmedLine,
        suffix
    };
}
export const DESCRIPTION_TAG_PATTERN = /^\/\/\/\s*@description\b/i;

export function resolveDescriptionIndentation(line: string) {
    const trimmedStart = line.trimStart();
    const indent = line.slice(0, line.length - trimmedStart.length);
    const prefixMatch = trimmedStart.match(/^(\/\/\/\s*@description\s+)/i);
    const prefix = prefixMatch ? prefixMatch[1] : "/// @description ";
    return { indent, prefix };
}

function formatDescriptionContinuationLine(line: string, continuationPrefix: string): string | null {
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
    const suffix = docLikeMatch ? (docLikeMatch[1] ?? "").trim() : trimmed.slice(3).replace(/^\s+/, "");
    if (suffix.length === 0) {
        return null;
    }

    const normalizedPrefix = continuationPrefix.trimStart();
    if (trimmed.startsWith(normalizedPrefix)) {
        return line;
    }

    return `${continuationPrefix}${suffix}`;
}

export function collectDescriptionContinuations(docCommentDocs: MutableDocCommentLines | readonly unknown[]): string[] {
    if (!Array.isArray(docCommentDocs)) {
        return [];
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) => typeof line === STRING_TYPE && DESCRIPTION_TAG_PATTERN.test(line.trim())
    );

    if (descriptionIndex === -1) {
        return [];
    }

    const continuations: string[] = [];

    for (let index = descriptionIndex + 1; index < docCommentDocs.length; index += 1) {
        const line = docCommentDocs[index];
        const classification = classifyDescriptionContinuationLine(line);

        if (classification.kind === "stop") {
            break;
        }

        if (classification.kind === "empty") {
            continue;
        }

        continuations.push(classification.originalLine);
    }

    return continuations;
}

export function applyDescriptionContinuations(
    docCommentDocs: MutableDocCommentLines,
    continuations: string[]
): MutableDocCommentLines {
    // Note: We preserve the original Array.isArray check for docCommentDocs (instead of
    // using Core.isNonEmptyArray) to maintain exact semantics - the function proceeds
    // even if docCommentDocs is empty, allowing findIndex to return -1 and exit naturally.
    if (!Array.isArray(docCommentDocs) || !Core.isNonEmptyArray(continuations)) {
        return docCommentDocs;
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) => typeof line === STRING_TYPE && DESCRIPTION_TAG_PATTERN.test(line.trim())
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
        const formatted = formatDescriptionContinuationLine(original, continuationPrefix);

        if (!formatted) {
            continue;
        }

        const normalized = formatted.trim();
        const alreadyExists = docCommentDocs.some((line) => typeof line === STRING_TYPE && line.trim() === normalized);

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

export function ensureDescriptionContinuations(docCommentDocs: MutableDocCommentLines) {
    if (!Array.isArray(docCommentDocs)) {
        return;
    }

    const descriptionIndex = docCommentDocs.findIndex(
        (line) => typeof line === STRING_TYPE && DESCRIPTION_TAG_PATTERN.test(line.trim())
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

    for (let index = descriptionIndex + 1; index < docCommentDocs.length; index += 1) {
        const line = docCommentDocs[index];

        const classification = classifyDescriptionContinuationLine(line);
        if (classification.kind === "stop") {
            break;
        }

        if (classification.kind === "empty") {
            continue;
        }

        const formatted = formatDescriptionContinuationLine(line, continuationPrefix);
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
