type LineComment = {
    value?: string;
};

function resolveRawDocLikeRemainder(comment: LineComment): string {
    if (!comment || typeof comment.value !== "string") {
        return "";
    }

    const trimmed = comment.value.trimStart();
    if (trimmed.startsWith("/")) {
        return trimmed.slice(1).trimStart();
    }

    return trimmed;
}

function normalizeDocLikeLineComment(
    comment: LineComment,
    formatted: string
): string {
    void comment;

    if (typeof formatted !== "string" || formatted.length === 0) {
        return formatted;
    }

    const leadingWhitespaceMatch = formatted.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch
        ? leadingWhitespaceMatch[0]
        : "";
    const trimmedFormatted = formatted.trimStart();

    if (trimmedFormatted.startsWith("///")) {
        const normalizedRemainder = trimmedFormatted.slice(3).trimStart();
        if (normalizedRemainder.startsWith("@")) {
            return formatted;
        }
        if (
            normalizedRemainder.length === 0 ||
            !/^[A-Za-z0-9]/.test(normalizedRemainder)
        ) {
            const rawRemainder = resolveRawDocLikeRemainder(comment);
            if (rawRemainder.length > 0) {
                return `${leadingWhitespace}// ${rawRemainder}`;
            }
            return (
                leadingWhitespace +
                (normalizedRemainder.length > 0
                    ? `// ${normalizedRemainder}`
                    : "//")
            );
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

    return (
        leadingWhitespace +
        (formattedRemainder.length > 0 ? `// ${formattedRemainder}` : "//")
    );
}

export { normalizeDocLikeLineComment };
