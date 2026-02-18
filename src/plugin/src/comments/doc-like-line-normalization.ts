import { Core } from "@gml-modules/core";

type LineComment = {
    value?: string;
    start?: number | { index?: number };
};

type LineCommentOptions = Record<string, unknown>;

function resolveRawDocLikeRemainder(rawText: string): string {
    const trimmed = rawText.trimStart();
    const docLikePrefixMatch = trimmed.match(/^\/+/);
    if (docLikePrefixMatch) {
        return trimmed.slice(docLikePrefixMatch[0].length).trimStart();
    }
    return trimmed;
}

function resolveRawDocLikeRemainderWithIndent(rawText: string): string {
    const match = rawText.match(/^\s*\/{3}/);
    if (!match) {
        return resolveRawDocLikeRemainder(rawText);
    }
    return rawText.slice(match[0].length);
}

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
    return /^\s*\/\/\//.test(line);
}

function isDocTagLine(line: string): boolean {
    return /^\s*\/\/\/\s*@/i.test(line);
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

function formatDocLikeLineComment(
    comment: LineComment,
    lineCommentOptions: LineCommentOptions,
    originalText: string | null | undefined
): string | null {
    const formattingOptions = originalText === undefined ? lineCommentOptions : { ...lineCommentOptions, originalText };
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: originalText ?? undefined
    });
    if (/^\s*\/\/\s+\/\s*$/.test(rawText)) {
        return null;
    }
    const isDocTagLineRaw = /^\s*\/\/\/\s*@/i.test(rawText);
    if (originalText === null && rawText.trimStart().startsWith("///") && !isDocTagLineRaw) {
        const remainder = rawText.slice(rawText.indexOf("///") + 3);
        if (remainder.trim().length === 0) {
            return rawText.trimEnd();
        }
        if (/^[ \t]{2,}/.test(remainder)) {
            return rawText.trimEnd();
        }
    }

    const formatted = Core.formatLineComment(comment, formattingOptions);
    if (typeof formatted !== "string") {
        if (rawText.trimStart().startsWith("///") && hasDocTagInTripleSlashBlock(comment, originalText)) {
            return rawText.trimEnd();
        }
        if (rawText.trimEnd() === "///") {
            return rawText.trimEnd();
        }
        return null;
    }
    return normalizeDocLikeLineComment(comment, formatted, originalText);
}

function normalizeDocLikeLineComment(comment: LineComment, formatted: string, originalText?: string | null): string {
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: originalText ?? undefined
    });

    void comment;

    if (typeof formatted !== "string" || formatted.length === 0) {
        return formatted;
    }

    const leadingWhitespaceMatch = formatted.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
    const trimmedFormatted = formatted.trimStart();
    const docLikeRawValue = rawText.trim();
    const rawTrimmedStart = rawText.trimStart();
    const rawRemainder = resolveRawDocLikeRemainder(rawText);
    const rawRemainderWithIndent = resolveRawDocLikeRemainderWithIndent(rawText);
    const hasDocTagBlock = hasDocTagInTripleSlashBlock(comment, originalText);

    const bannerMatch = docLikeRawValue.match(/^\/{4,}(.*)$/);
    if (bannerMatch) {
        const bannerContent = bannerMatch[1].replace(/\/+$/, "").trim();
        if (bannerContent.length === 0) {
            return "";
        }
        return `${leadingWhitespace}// ${bannerContent}`;
    }

    const docLikeRawMatch = docLikeRawValue.match(/^\/\/\s+\/(?![/])/);
    if (docLikeRawMatch) {
        const remainder = docLikeRawValue.slice(docLikeRawMatch[0].length).trimStart();
        return `${leadingWhitespace}/// ${remainder}`;
    }

    if (docLikeRawValue.startsWith("/") && docLikeRawValue.slice(1).trim().length === 0) {
        return "";
    }

    if (
        rawTrimmedStart.startsWith("///") &&
        trimmedFormatted.startsWith("//") &&
        !trimmedFormatted.startsWith("///") &&
        hasDocTagBlock
    ) {
        const trimmedRawRemainder = rawRemainderWithIndent.trim();
        if (trimmedRawRemainder.length === 0) {
            return `${leadingWhitespace}///`;
        }
        return `${leadingWhitespace}///${rawRemainderWithIndent}`;
    }

    if (trimmedFormatted.startsWith("///")) {
        const normalizedRemainder = trimmedFormatted.slice(3).trimStart();
        if (normalizedRemainder.startsWith("@")) {
            return formatted;
        }

        if (normalizedRemainder.length === 0) {
            return `${leadingWhitespace}///`;
        }

        if (hasDocTagBlock && /^\s+/.test(rawRemainderWithIndent)) {
            return `${leadingWhitespace}///${rawRemainderWithIndent}`;
        }

        // If the comment was just slashes (e.g. ////////), remove it
        if (rawRemainder.length === 0 && /^\/+$/.test(normalizedRemainder)) {
            return "";
        }

        if (normalizedRemainder.startsWith("/") || !/[A-Za-z0-9]/.test(normalizedRemainder)) {
            const fallback = rawRemainder.length > 0 ? rawRemainder : normalizedRemainder;
            if (fallback.length === 0) {
                return "";
            }
            return `${leadingWhitespace}// ${fallback}`;
        }

        if (normalizedRemainder.startsWith(".")) {
            return `${leadingWhitespace}// ${normalizedRemainder}`;
        }
        return formatted;
    }

    const docLikeMatch = trimmedFormatted.match(/^\/\/\s+\/(?![/])/);
    if (docLikeMatch) {
        const formattedRemainder = trimmedFormatted.slice(docLikeMatch[0].length).trimStart();
        if (formattedRemainder.startsWith("@")) {
            return formatted;
        }

        if (formattedRemainder.length === 0) {
            return `${leadingWhitespace}///`;
        }

        if (formattedRemainder.startsWith(".")) {
            return `${leadingWhitespace}// ${formattedRemainder}`;
        }

        if (formattedRemainder.startsWith("/") || !/[A-Za-z0-9]/.test(formattedRemainder)) {
            const rawDocLikeRemainder = resolveRawDocLikeRemainder(rawText);
            const fallback = rawDocLikeRemainder.length > 0 ? rawDocLikeRemainder : formattedRemainder;
            if (fallback.length === 0) {
                return "";
            }
            return `${leadingWhitespace}/// ${fallback}`;
        }

        return `${leadingWhitespace}/// ${formattedRemainder}`;
    }

    // Handle banner-like comments (e.g. //////// Banner)
    if (/^\/{4,}/.test(trimmedFormatted)) {
        const bannerRemainder = resolveRawDocLikeRemainder(rawText);
        if (bannerRemainder.length === 0) {
            return "";
        }
        return `${leadingWhitespace}// ${bannerRemainder}`;
    }

    return formatted;
}

export { formatDocLikeLineComment, normalizeDocLikeLineComment };
