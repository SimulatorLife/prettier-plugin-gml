import { Core } from "@gml-modules/core";

export function fixMalformedComments(sourceText) {
    if (!Core.isNonEmptyString(sourceText)) {
        return sourceText;
    }

    return sourceText.replaceAll(/^(\s*)\/\s+(@.+)$/gm, "$1// $2");
}

export function recoverParseSourceFromMissingBrace(sourceText, error) {
    if (!isMissingClosingBraceError(error)) {
        return null;
    }

    const appended = appendMissingClosingBraces(sourceText);

    return appended === sourceText ? null : appended;
}

function isMissingClosingBraceError(error) {
    if (!error) {
        return false;
    }

    const message = Core.isNonEmptyString(error?.message)
        ? error.message
        : Core.isNonEmptyString(error)
          ? error
          : String(error ?? "");

    return message.toLowerCase().includes("missing associated closing brace");
}

function appendMissingClosingBraces(sourceText) {
    if (!Core.isNonEmptyString(sourceText)) {
        return sourceText;
    }

    const missingBraceCount = countUnclosedBraces(sourceText);

    if (missingBraceCount <= 0) {
        return sourceText;
    }

    let normalized = sourceText;

    if (!normalized.endsWith("\n")) {
        normalized += "\n";
    }

    const closingLines = new Array(missingBraceCount).fill("}").join("\n");

    return `${normalized}${closingLines}`;
}

function countUnclosedBraces(sourceText) {
    let depth = 0;
    let inSingleLineComment = false;
    let inBlockComment = false;
    let stringDelimiter: string | null = null;
    let isEscaped = false;

    for (let index = 0; index < sourceText.length; index += 1) {
        const char = sourceText[index];
        const nextChar = sourceText[index + 1];

        if (stringDelimiter) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (char === "\\") {
                isEscaped = true;
                continue;
            }

            if (char === stringDelimiter) {
                stringDelimiter = null;
            }

            continue;
        }

        if (inSingleLineComment) {
            if (char === "\n") {
                inSingleLineComment = false;
            }

            continue;
        }

        if (inBlockComment) {
            if (char === "*" && nextChar === "/") {
                inBlockComment = false;
                index += 1;
            }

            continue;
        }

        if (char === "/" && nextChar === "/") {
            inSingleLineComment = true;
            index += 1;
            continue;
        }

        if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (char === "'" || char === '"') {
            stringDelimiter = char;
            continue;
        }

        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}" && depth > 0) {
            depth -= 1;
        }
    }

    return depth;
}
