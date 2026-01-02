import { Core } from "@gml-modules/core";

type LineComment = {
    value?: string;
};

function resolveRawDocLikeRemainder(rawText: string): string {
    const trimmed = rawText.trimStart();
    const docLikePrefixMatch = trimmed.match(/^\/+/);
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

    if (docLikeRawValue.includes("Please do not use")) {
        console.log("DEBUG: testComments", {
            docLikeRawValue,
            match: /^\/\/\s+\/(?![\/])/.test(docLikeRawValue)
        });
    }

    if (/^\/{4,}/.test(docLikeRawValue)) {
        return `${leadingWhitespace}${docLikeRawValue}`;
    }

    const docLikeRawMatch = docLikeRawValue.match(/^\/\/\s+\/(?![\/])/);
    if (docLikeRawMatch) {
        const remainder = docLikeRawValue
            .slice(docLikeRawMatch[0].length)
            .trimStart();
        return `${leadingWhitespace}/// ${remainder}`;
    }

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

        // If the comment was just slashes (e.g. ////////), remove it
        if (rawRemainder.length === 0 && /^\/+$/.test(normalizedRemainder)) {
            return "";
        }

        if (
            normalizedRemainder.startsWith("/") ||
            !/[A-Za-z0-9]/.test(normalizedRemainder)
        ) {
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
    if (docLikeMatch) {
        const formattedRemainder = trimmedFormatted
            .slice(docLikeMatch[0].length)
            .trimStart();
        if (formattedRemainder.startsWith("@")) {
            return formatted;
        }

        if (formattedRemainder.length === 0) {
            return `${leadingWhitespace}///`;
        }

        if (
            formattedRemainder.startsWith("/") ||
            !/[A-Za-z0-9]/.test(formattedRemainder)
        ) {
            const rawDocLikeRemainder = resolveRawDocLikeRemainder(rawText);
            const fallback =
                rawDocLikeRemainder.length > 0
                    ? rawDocLikeRemainder
                    : formattedRemainder;
            if (fallback.length === 0) {
                return "";
            }
            return `${leadingWhitespace}/// ${fallback}`;
        }

        return `${leadingWhitespace}/// ${formattedRemainder}`;
    }

    // Handle banner-like comments (e.g. //////// Banner)
    if (/^\/{4,}/.test(trimmedFormatted)) {
        const rawRemainder = resolveRawDocLikeRemainder(rawText);
        if (rawRemainder.length === 0) {
            return "";
        }
        return `${leadingWhitespace}// ${rawRemainder}`;
    }

    return formatted;
}

export { normalizeDocLikeLineComment };
