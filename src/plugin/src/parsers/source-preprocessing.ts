/**
 * Source text preprocessing utilities for the GML formatter.
 *
 * These functions perform source-level transformations before parsing to handle
 * common formatting issues and error recovery scenarios. They operate on raw
 * text rather than AST nodes, making them distinct from the parser's core
 * responsibility of GML → AST conversion.
 */

import { Core } from "@gml-modules/core";

/**
 * Result of a comment fix operation, including the transformed text and a
 * mapping function to convert indices in the new text back to the original.
 */
export type CommentFixResult = {
    readonly sourceText: string;
    readonly indexMapper: (index: number) => number;
};

/**
 * Attempts to recover from missing closing braces by appending them to the source.
 *
 * When the parser fails due to missing closing braces, this function appends the
 * appropriate number of closing braces to allow parsing to continue. Returns null
 * if the error is not brace-related or if no braces need to be added.
 *
 * @param sourceText - Raw GML source code that failed to parse
 * @param error - The error object from the failed parse attempt
 * @returns The source text with appended braces, or null if recovery is not applicable
 */
export function recoverParseSourceFromMissingBrace(sourceText: string, error: unknown): string | null {
    if (!isMissingClosingBraceError(error)) {
        return null;
    }

    const appended = appendMissingClosingBraces(sourceText);

    return appended === sourceText ? null : appended;
}

/**
 * Determines whether an error indicates missing closing braces.
 */
function isMissingClosingBraceError(error: unknown): boolean {
    if (!error) {
        return false;
    }

    const message = Core.isNonEmptyString((error as { message?: unknown }).message)
        ? (error as { message: string }).message
        : Core.isNonEmptyString(error)
          ? String(error)
          : "";

    return message.toLowerCase().includes("missing associated closing brace");
}

/**
 * Appends the necessary number of closing braces to balance unclosed opening braces.
 */
function appendMissingClosingBraces(sourceText: string): string {
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

    const closingLines = Array.from({ length: missingBraceCount }, () => "}").join("\n");

    return `${normalized}${closingLines}`;
}

/**
 * Counts the number of unclosed opening braces in the source text.
 *
 * Skips braces that appear in comments or strings to avoid false positives.
 */
function countUnclosedBraces(sourceText: string): number {
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
