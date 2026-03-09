import { Core } from "@gml-modules/core";

type LineComment = {
    value?: string;
    start?: number | { index?: number };
    precedingNode?: unknown;
};

type LineCommentOptions = Record<string, unknown>;

function resolveCommentStartIndex(comment: LineComment): number | null {
    const start = comment.start;
    if (typeof start === "number") {
        return start;
    }

    if (start && typeof start === "object" && typeof start.index === "number") {
        return start.index;
    }

    return null;
}

function getLineStartIndex(text: string, index: number): number {
    const lineStart = text.lastIndexOf("\n", Math.max(0, index - 1));
    return lineStart === -1 ? 0 : lineStart + 1;
}

function getLineEndIndex(text: string, index: number): number {
    const lineEnd = text.indexOf("\n", index);
    return lineEnd === -1 ? text.length : lineEnd;
}

function isTripleSlashLine(line: string): boolean {
    return /^\s*\/\/\//u.test(line);
}

function isDocTagLine(line: string): boolean {
    return /^\s*\/\/\/\s*@/iu.test(line);
}

function hasDocTagInTripleSlashBlock(comment: LineComment, originalText: string | null | undefined): boolean {
    if (typeof originalText !== "string") {
        return false;
    }

    const startIndex = resolveCommentStartIndex(comment);
    if (startIndex === null || startIndex < 0 || startIndex > originalText.length) {
        return false;
    }

    const lineStart = getLineStartIndex(originalText, startIndex);
    const lineEnd = getLineEndIndex(originalText, startIndex);

    let cursorStart = lineStart;
    while (cursorStart >= 0) {
        const cursorEnd = getLineEndIndex(originalText, cursorStart);
        const line = originalText.slice(cursorStart, cursorEnd);
        if (!isTripleSlashLine(line)) {
            break;
        }
        if (isDocTagLine(line)) {
            return true;
        }
        if (cursorStart === 0) {
            break;
        }
        cursorStart = getLineStartIndex(originalText, cursorStart - 1);
    }

    let cursorEnd = lineEnd;
    while (cursorEnd < originalText.length) {
        const nextStart = cursorEnd + 1;
        if (nextStart >= originalText.length) {
            break;
        }
        const nextEnd = getLineEndIndex(originalText, nextStart);
        const line = originalText.slice(nextStart, nextEnd);
        if (!isTripleSlashLine(line)) {
            break;
        }
        if (isDocTagLine(line)) {
            return true;
        }
        cursorEnd = nextEnd;
    }

    return false;
}

function isLegacyDoubleSlashDocAnnotation(rawText: string): boolean {
    return /^\s*\/\/\s*@/u.test(rawText);
}

function isLegacySingleSlashDocPrefix(rawText: string): boolean {
    return /^\s*\/\/\s+\/(?!\/)/u.test(rawText);
}

function isTripleSlashSeparatorLine(rawText: string): boolean {
    return rawText.trim() === "///";
}

function isMethodListTripleSlashLine(rawText: string): boolean {
    return /^\s*\/\/\/\s+\.[A-Za-z_]/u.test(rawText);
}

function isBannerLikeLineComment(rawText: string): boolean {
    const trimmed = rawText.trimStart();
    if (!trimmed.startsWith("//")) {
        return false;
    }

    if (/^\/{4,}/u.test(trimmed)) {
        return true;
    }

    return /[/_*#<>|:~-]{6,}/u.test(trimmed);
}

function isCommentedOutCodeLine(rawText: string): boolean {
    return /^\s*\/\/\s*[A-Za-z_]\w*\s*:/u.test(rawText);
}

function isSlashOnlyLineComment(rawText: string): boolean {
    return /^\s*\/{6,}\s*$/u.test(rawText);
}

function findDecorativeBlockTerminatorBeforeSlashLineComment(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): number | null {
    if (!isSlashOnlyLineComment(rawText) || typeof originalText !== "string") {
        return null;
    }

    const startIndex = resolveCommentStartIndex(comment);
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > originalText.length) {
        return null;
    }

    let cursor = startIndex - 1;
    while (cursor >= 0) {
        const char = originalText[cursor];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            cursor -= 1;
            continue;
        }
        break;
    }

    if (cursor < 1 || originalText[cursor] !== "/" || originalText[cursor - 1] !== "*") {
        return null;
    }

    const blockTerminatorIndex = cursor;
    const blockStartIndex = originalText.lastIndexOf("/*", blockTerminatorIndex - 1);
    if (blockStartIndex === -1) {
        return null;
    }

    const blockCommentSource = originalText.slice(blockStartIndex, blockTerminatorIndex + 1);
    if (!/\/{6,}/u.test(blockCommentSource)) {
        return null;
    }

    return blockTerminatorIndex;
}

function isInlineSlashSuffixAfterDecorativeBlockComment(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): boolean {
    if (typeof originalText !== "string") {
        return false;
    }

    const blockTerminatorIndex = findDecorativeBlockTerminatorBeforeSlashLineComment(comment, rawText, originalText);
    if (blockTerminatorIndex === null) {
        return false;
    }

    const startIndex = resolveCommentStartIndex(comment);
    if (startIndex === null) {
        return false;
    }

    const gap = originalText.slice(blockTerminatorIndex + 1, startIndex);
    return !/[\n\r]/u.test(gap);
}

function isSlashLineAfterDecorativeBlockComment(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): boolean {
    return findDecorativeBlockTerminatorBeforeSlashLineComment(comment, rawText, originalText) !== null;
}

function isTripleSlashDecorativeLine(rawText: string): boolean {
    return /^\s*\/\/\/\s*[_*#<>|:~-]{3,}/u.test(rawText);
}

function isTripleSlashLineAdjacentToDecorativeSeparator(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): boolean {
    if (typeof originalText !== "string") {
        return false;
    }

    if (!rawText.trimStart().startsWith("///") || isDocTagLine(rawText)) {
        return false;
    }

    const startIndex = resolveCommentStartIndex(comment);
    if (startIndex === null || startIndex < 0 || startIndex > originalText.length) {
        return false;
    }

    const lineStart = getLineStartIndex(originalText, startIndex);
    const lineEnd = getLineEndIndex(originalText, startIndex);
    const previousLineStart = lineStart > 0 ? getLineStartIndex(originalText, Math.max(0, lineStart - 1)) : null;
    const previousLine =
        previousLineStart === null
            ? ""
            : originalText.slice(previousLineStart, getLineEndIndex(originalText, previousLineStart));
    const nextLineStart = lineEnd + 1;
    const nextLine =
        nextLineStart >= originalText.length
            ? ""
            : originalText.slice(nextLineStart, getLineEndIndex(originalText, nextLineStart));

    return isTripleSlashDecorativeLine(previousLine) || isTripleSlashDecorativeLine(nextLine);
}

function isTripleSlashContinuationInDocBlock(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): boolean {
    if (!rawText.trimStart().startsWith("///")) {
        return false;
    }

    if (isDocTagLine(rawText) || isMethodListTripleSlashLine(rawText)) {
        return false;
    }

    return hasDocTagInTripleSlashBlock(comment, originalText);
}

function shouldPreserveRawFormatterLineComment(
    comment: LineComment,
    rawText: string,
    originalText: string | null | undefined
): boolean {
    // Triple-slash doc-tag lines (/// @tag …) must be returned verbatim.
    // Tag-alias normalization (e.g. @func → @function, @desc → @description)
    // and other content rewrites (parameter-list stripping, type annotation
    // canonicalization) are owned exclusively by the lint rule
    // `gml/normalize-doc-comments` (target-state.md §2.2, §3.2).
    return (
        isDocTagLine(rawText) ||
        isLegacyDoubleSlashDocAnnotation(rawText) ||
        isLegacySingleSlashDocPrefix(rawText) ||
        isTripleSlashSeparatorLine(rawText) ||
        isMethodListTripleSlashLine(rawText) ||
        isBannerLikeLineComment(rawText) ||
        isCommentedOutCodeLine(rawText) ||
        isTripleSlashContinuationInDocBlock(comment, rawText, originalText) ||
        isTripleSlashLineAdjacentToDecorativeSeparator(comment, rawText, originalText)
    );
}

function formatDocLikeLineComment(
    comment: LineComment,
    lineCommentOptions: LineCommentOptions,
    originalText: string | null | undefined
): string | null {
    const formattingOptions = originalText === undefined ? lineCommentOptions : { ...lineCommentOptions, originalText };
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: originalText ?? undefined
    });

    // Decorative banner/comment-content cleanup is lint-owned (`gml/normalize-banner-comments`).
    // The formatter must keep source comment text and only apply layout operations.
    if (isInlineSlashSuffixAfterDecorativeBlockComment(comment, rawText, originalText)) {
        // Decorative block comments preserve their same-line slash suffix when the
        // block token range is extended by the comment printer. Suppress the parsed
        // line-comment token to avoid printing that suffix twice.
        return "";
    }

    if (isSlashLineAfterDecorativeBlockComment(comment, rawText, originalText)) {
        return rawText.trimEnd();
    }

    if (shouldPreserveRawFormatterLineComment(comment, rawText, originalText)) {
        return rawText.trimEnd();
    }

    const formatted = Core.formatLineComment(comment, formattingOptions);
    if (typeof formatted !== "string") {
        return null;
    }

    return normalizeDocLikeLineComment(comment, formatted, originalText);
}

function normalizeDocLikeLineComment(comment: LineComment, formatted: string, originalText?: string | null): string {
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: originalText ?? undefined
    });

    if (typeof formatted !== "string" || formatted.length === 0) {
        return formatted;
    }

    if (shouldPreserveRawFormatterLineComment(comment, rawText, originalText)) {
        return rawText.trimEnd();
    }

    return formatted;
}

export { formatDocLikeLineComment, normalizeDocLikeLineComment, shouldPreserveRawFormatterLineComment };
