import { Core } from "@gml-modules/core";

const STRING_TYPE = "string" as const;
const NUMBER_TYPE = "number" as const;
const FUNCTION_TYPE = "function" as const;

export type PrinterSourceMetadataOptions = {
    originalText?: unknown;
    locStart?: unknown;
    locEnd?: unknown;
};

export type PrinterSourceMetadata = {
    originalText: string | null;
    locStart: ((node: unknown) => number) | null;
    locEnd: ((node: unknown) => number) | null;
};

/**
 * Extract the original source text string from arbitrary printer options.
 *
 * Multiple printer helpers only need the raw text without inspecting location
 * callbacks. Centralizing the normalization keeps those call sites consistent
 * and avoids repeated destructuring boilerplate.
 */
export function getOriginalTextFromOptions(options: unknown): string | null {
    return resolvePrinterSourceMetadata(options).originalText;
}

/**
 * Remove trailing CR/LF sequences from a macro or comment body without
 * allocating regular expression instances on the hot path.
 */
export function stripTrailingLineTerminators(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 0x0a) {
        end -= 1;

        if (end > 0 && value.charCodeAt(end - 1) === 0x0d) {
            end -= 1;
        }
    }

    return end === value.length ? value : value.slice(0, end);
}

/**
 * Normalize printer metadata options while validating types.
 */
export function resolvePrinterSourceMetadata(options: unknown): PrinterSourceMetadata {
    if (!Core.isObjectOrFunction(options)) {
        return { originalText: null, locStart: null, locEnd: null };
    }

    const metadata = options as PrinterSourceMetadataOptions;

    const originalText = typeof metadata.originalText === STRING_TYPE ? (metadata.originalText as string) : null;
    const locStart =
        typeof metadata.locStart === FUNCTION_TYPE ? (metadata.locStart as (node: unknown) => number) : null;
    const locEnd = typeof metadata.locEnd === FUNCTION_TYPE ? (metadata.locEnd as (node: unknown) => number) : null;

    return { originalText, locStart, locEnd };
}

/**
 * Resolve the numeric start and end indices for a node using either explicit
 * metadata callbacks or the default Core helpers.
 */
export function resolveNodeIndexRangeWithSource(
    node: unknown,
    sourceMetadata: PrinterSourceMetadata = {
        originalText: null,
        locStart: null,
        locEnd: null
    }
): { startIndex: number; endIndex: number } {
    const { locStart, locEnd } = sourceMetadata;
    const { start, end } = Core.getNodeRangeIndices(node);

    const fallbackStart = typeof start === NUMBER_TYPE ? start : 0;
    let fallbackEnd = fallbackStart;

    if (typeof end === NUMBER_TYPE) {
        const inclusiveEnd = end - 1;
        fallbackEnd = Math.max(inclusiveEnd, fallbackStart);
    }

    const resolvedStart = typeof locStart === "function" ? locStart(node) : null;
    const startIndex = typeof resolvedStart === NUMBER_TYPE ? resolvedStart : fallbackStart;

    const resolvedEnd = typeof locEnd === "function" ? locEnd(node) : null;
    const computedEnd = typeof resolvedEnd === NUMBER_TYPE ? resolvedEnd - 1 : fallbackEnd;
    const endIndex = Math.max(computedEnd, startIndex);

    return { startIndex, endIndex };
}

/**
 * Safely slice a source string when all bounds are valid numbers and the range
 * is non-empty.
 */
export function sliceOriginalText(
    originalText: string | null,
    startIndex: number | null,
    endIndex: number | null
): string | null {
    if (typeof originalText !== STRING_TYPE || originalText.length === 0) {
        return null;
    }

    if (typeof startIndex !== NUMBER_TYPE || typeof endIndex !== NUMBER_TYPE) {
        return null;
    }

    if (endIndex <= startIndex) {
        return null;
    }

    return originalText.slice(startIndex, endIndex);
}

/**
 * Determine whether a macro body explicitly contains a trailing blank line.
 */
export function macroTextHasExplicitTrailingBlankLine(text: string | null): boolean {
    if (typeof text !== STRING_TYPE) {
        return false;
    }

    let newlineCount = 0;
    let index = text.length - 1;

    while (index >= 0) {
        const code = text.charCodeAt(index);

        if (code === 0x20 || code === 0x09) {
            index -= 1;
            continue;
        }

        if (code === 0x0a) {
            newlineCount += 1;
            index -= 1;

            if (index >= 0 && text.charCodeAt(index) === 0x0d) {
                index -= 1;
            }

            if (newlineCount >= 2) {
                return true;
            }

            continue;
        }

        if (code === 0x0d) {
            newlineCount += 1;
            index -= 1;

            if (newlineCount >= 2) {
                return true;
            }

            continue;
        }

        break;
    }

    return false;
}

/**
 * Detect whether a block body starts with a blank line before its leading
 * comment.
 */
export function hasBlankLineBeforeLeadingComment(
    blockNode: unknown,
    sourceMetadata: PrinterSourceMetadata,
    originalText: string | null,
    firstStatementStartIndex: number | null
): boolean {
    if (!blockNode || typeof originalText !== STRING_TYPE || typeof firstStatementStartIndex !== NUMBER_TYPE) {
        return false;
    }

    const { startIndex: blockStartIndex } = resolveNodeIndexRangeWithSource(blockNode, sourceMetadata);

    if (typeof blockStartIndex !== NUMBER_TYPE || blockStartIndex >= firstStatementStartIndex) {
        return false;
    }

    const openBraceIndex = originalText.indexOf("{", blockStartIndex);
    if (openBraceIndex === -1 || openBraceIndex >= firstStatementStartIndex) {
        return false;
    }

    const interiorSlice = sliceOriginalText(originalText, openBraceIndex + 1, firstStatementStartIndex);

    if (!interiorSlice) {
        return false;
    }

    const commentMatch = interiorSlice.match(/\/\/|\/\*/);
    if (!commentMatch || typeof commentMatch.index !== NUMBER_TYPE) {
        return false;
    }

    const textBeforeComment = interiorSlice.slice(0, commentMatch.index);
    if (Core.isNonEmptyTrimmedString(textBeforeComment)) {
        return false;
    }

    return /\r?\n[^\S\r\n]*\r?\n[^\S\r\n]*$/.test(textBeforeComment);
}

/**
 * Determine whether a trailing blank line exists between the final comment and
 * a block's closing brace.
 */
export function hasBlankLineBetweenLastCommentAndClosingBrace(
    blockNode: unknown,
    sourceMetadata: PrinterSourceMetadata,
    originalText: string | null
): boolean {
    if (!blockNode || typeof originalText !== STRING_TYPE) {
        return false;
    }

    const comments = Core.getCommentArray(blockNode);
    let lastComment: unknown = null;

    for (let index = comments.length - 1; index >= 0; index -= 1) {
        const comment = comments[index];
        if (Core.isCommentNode(comment)) {
            lastComment = comment;
            break;
        }
    }

    if (!lastComment) {
        return false;
    }

    const commentEndIndex = Core.getNodeEndIndex(lastComment);
    const { endIndex: blockEndIndex } = resolveNodeIndexRangeWithSource(blockNode, sourceMetadata);

    if (typeof commentEndIndex !== NUMBER_TYPE || typeof blockEndIndex !== NUMBER_TYPE) {
        return false;
    }

    const closingBraceIndex = blockEndIndex;
    if (commentEndIndex >= closingBraceIndex) {
        return false;
    }

    const betweenText = sliceOriginalText(originalText, commentEndIndex, closingBraceIndex);

    if (betweenText === null) {
        return false;
    }

    if (Core.isNonEmptyTrimmedString(betweenText)) {
        return false;
    }

    return /\r?\n[^\S\r\n]*\r?\n/.test(betweenText);
}
