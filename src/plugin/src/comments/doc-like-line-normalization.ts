import { Core } from "@gml-modules/core";

type LineComment = {
    value?: string;
};

function resolveRawDocLikeRemainder(rawText: string): string {
    const trimmed = rawText.trimStart();
    const docLikePrefixMatch = trimmed.match(/^\/\/\s*\/?/);
    if (docLikePrefixMatch) {
        return trimmed.slice(docLikePrefixMatch[0].length).trimStart();
    }
    return trimmed;
}

function normalizeDocLikeLineComment(
    comment: LineComment,
    formatted: string,
    originalText?: string | null
): string {
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: originalText ?? undefined
    });

    void comment;

    if (typeof formatted !== "string" || formatted.length === 0) {
        return formatted;
    }

    const leadingWhitespaceMatch = formatted.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch
        ? leadingWhitespaceMatch[0]
        : "";
    const trimmedFormatted = formatted.trimStart();
    const docLikeRawValue = rawText.trim();
    if (
        docLikeRawValue.startsWith("/") &&
        docLikeRawValue.slice(1).trim().length === 0
    ) {
        return "";
    }

    if (trimmedFormatted.startsWith("///")) {
        const normalizedRemainder = trimmedFormatted.slice(3).trimStart();
        if (normalizedRemainder.startsWith("@")) {
            return formatted;
        }

        const rawRemainder = resolveRawDocLikeRemainder(rawText);
        if (normalizedRemainder.length === 0) {
            return "";
        }

        if (!/^[A-Za-z0-9]/.test(normalizedRemainder)) {
            const fallback =
                rawRemainder.length > 0 ? rawRemainder : normalizedRemainder;
            if (fallback.length === 0) {
                return "";
            }
            return `${leadingWhitespace}// ${fallback}`;
        }
        return formatted;
    }

    const docLikeMatch = trimmedFormatted.match(/^\/\/\s+\/(?![\/])/);
    if (!docLikeMatch) {
        return formatted;
    }

    const formattedRemainder = trimmedFormatted
        .slice(docLikeMatch[0].length)
        .trimStart();
    if (formattedRemainder.startsWith("@")) {
        return formatted;
    }

    if (formattedRemainder.length === 0) {
        return `${leadingWhitespace}//`;
    }

    if (!/^[A-Za-z0-9]/.test(formattedRemainder)) {
        const rawDocLikeRemainder = resolveRawDocLikeRemainder(rawText);
        const fallback =
            rawDocLikeRemainder.length > 0
                ? rawDocLikeRemainder
                : formattedRemainder;
        if (fallback.length === 0) {
            return "";
        }
        return `${leadingWhitespace}// ${fallback}`;
    }

    return `${leadingWhitespace}// ${formattedRemainder}`;
}

export { normalizeDocLikeLineComment };
