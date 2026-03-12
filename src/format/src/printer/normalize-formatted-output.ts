import { Core } from "@gmloop/core";

const { isNonEmptyTrimmedString } = Core;

const MULTIPLE_BLANK_LINE_PATTERN = /\n{3,}/g;
const WHITESPACE_ONLY_BLANK_LINE_PATTERN = /\n[ \t]+\n/g;
const LINE_COMMENT_TO_BLOCK_COMMENT_BLANK_PATTERN = /(\/\/(?!\/)[^\n]*\n)[ \t]*\n(?=[ \t]*\/\*)/g;
const BLOCK_OPENING_BLANK_PATTERN = /\{\n[ \t]*\n(?![ \t]*(?:\/\/\/|\/\*))/g;
const DECORATIVE_COMMENT_BLANK_PATTERN = /\{\n[ \t]+\n(?=\s*\/\/)/g;

const INLINE_TRAILING_COMMENT_SPACING_PATTERN = /(?<=[^\s/,])[ \t]{2,}(?=\/\/(?!\/))/g;

const DOUBLE_INDENT_TO_SINGLE = new Map([
    ["        ", "    "],
    ["\t\t", "\t"]
]);

function collapseDuplicateBlankLines(formatted: string): string {
    return formatted.replaceAll(MULTIPLE_BLANK_LINE_PATTERN, "\n\n");
}

function collapseWhitespaceOnlyBlankLines(formatted: string): string {
    return formatted.replaceAll(WHITESPACE_ONLY_BLANK_LINE_PATTERN, "\n\n");
}

function collapseLineCommentToBlockCommentBlankLines(formatted: string): string {
    return formatted.replaceAll(LINE_COMMENT_TO_BLOCK_COMMENT_BLANK_PATTERN, "$1\n");
}

function collapseBlockOpeningBlankLines(formatted: string): string {
    return formatted.replaceAll(BLOCK_OPENING_BLANK_PATTERN, (matched, offset, source) => {
        const remaining = source.slice(offset + matched.length);
        const hasPlainLineComment = /^\s*\/\/(?!\/)/.test(remaining);

        if (hasPlainLineComment) {
            const previousNewlineIndex = source.lastIndexOf("\n", offset - 1);
            const lineStart = previousNewlineIndex === -1 ? 0 : previousNewlineIndex + 1;
            const openingLine = source.slice(lineStart, offset).trim();

            if (openingLine.includes("function")) {
                return "{\n\n";
            }
        }

        return "{\n";
    });
}

function trimDecorativeCommentBlankLines(formatted: string): string {
    return formatted.replaceAll(DECORATIVE_COMMENT_BLANK_PATTERN, "{\n\n");
}

function normalizeInlineTrailingCommentSpacing(formatted: string): string {
    return formatted.replaceAll(INLINE_TRAILING_COMMENT_SPACING_PATTERN, " ");
}

function normalizeSingleCommentBlockIndentation(formatted: string): string {
    const lines = formatted.split("\n");

    for (let index = 1; index < lines.length - 1; index += 1) {
        const previousLine = lines[index - 1] ?? "";
        const currentLine = lines[index] ?? "";
        const nextLine = lines[index + 1] ?? "";

        if (!previousLine.trimEnd().endsWith("{")) {
            continue;
        }

        const currentTrimmed = currentLine.trimStart();
        if (!currentTrimmed.startsWith("//")) {
            continue;
        }

        if (nextLine.trim() !== "}") {
            continue;
        }

        const currentIndent = currentLine.slice(0, currentLine.length - currentTrimmed.length);
        const closingIndent = nextLine.slice(0, nextLine.length - nextLine.trimStart().length);
        if (!currentIndent.startsWith(closingIndent)) {
            continue;
        }

        const extraIndent = currentIndent.slice(closingIndent.length);
        const normalizedExtraIndent = DOUBLE_INDENT_TO_SINGLE.get(extraIndent);
        if (normalizedExtraIndent === undefined) {
            continue;
        }

        lines[index] = `${closingIndent}${normalizedExtraIndent}${currentTrimmed}`;
    }

    return lines.join("\n");
}

/** Returns `true` when `line` starts with `//` (including doc-comment `///`) at column 0 with no leading whitespace. */
function isTopLevelLineComment(line: string | undefined): boolean {
    return typeof line === "string" && line.startsWith("//");
}

/**
 * Returns `true` when `line` is a top-level decorative block comment whose opening
 * token consists of a slash-asterisk pair immediately followed by 20 or more forward
 * slashes (for example a long decorative banner opener).
 *
 * These are the same patterns the legacy source-aware patching in format-entry.ts once
 * inspected the original source for. Detecting them in the formatted output directly
 * keeps the blank-line rule deterministic.
 */
function isTopLevelDecorativeBlockComment(line: string | undefined): boolean {
    return typeof line === "string" && /^\/\*\/{20,}/.test(line);
}

/**
 * Returns `true` when `line` is a top-level slash-only decorative banner: a line at
 * column 0 consisting of 21 or more consecutive forward slashes and nothing else.
 *
 * These pure-slash lines visually delimit code sections (e.g. camera-movement blocks).
 * Detecting them by their structure — rather than by consulting the original source —
 * satisfies the formatter-boundary contract.
 */
function isTopLevelSlashOnlyBanner(line: string | undefined): boolean {
    return typeof line === "string" && /^\/{21,}\s*$/.test(line);
}

/** Returns `true` when a blank line should be inserted before a top-level comment at `previousLine`. */
function shouldInsertBlankLineBeforeTopLevelComment(previousLine: string | undefined): boolean {
    return isNonEmptyTrimmedString(previousLine) && !isTopLevelLineComment(previousLine);
}

/** Returns `true` when `line` contains a plain `//` (not `///`) comment, optionally indented. */
function isPlainLineComment(line: string | undefined): boolean {
    return typeof line === "string" && /^\s*\/\/(?!\/)/.test(line);
}

function updateBlockCommentState(line: string, isInside: boolean): boolean {
    const startIndex = line.indexOf("/*");
    const endIndex = line.indexOf("*/");

    if (!isInside) {
        if (startIndex !== -1 && (endIndex === -1 || endIndex < startIndex)) {
            return true;
        }
        return false;
    }

    if (endIndex !== -1 && (startIndex === -1 || endIndex > startIndex)) {
        return false;
    }

    return true;
}

function ensureBlankLineBeforeTopLevelLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];
    let previousLine: string | undefined;
    let insideBlockComment = false;

    for (const line of lines) {
        if (
            !insideBlockComment &&
            isTopLevelLineComment(line) &&
            shouldInsertBlankLineBeforeTopLevelComment(previousLine)
        ) {
            result.push("");
        }

        result.push(line);
        previousLine = line;
        insideBlockComment = updateBlockCommentState(line, insideBlockComment);
    }

    return result.join("\n");
}

function getNextNonBlankLine(lines: string[], startIndex: number): string | undefined {
    return lines.slice(startIndex).find((line) => line.trim().length > 0);
}

function isGuardCommentSequence(lines: string[], commentIndex: number): boolean {
    const nextLine = getNextNonBlankLine(lines, commentIndex + 1);
    return typeof nextLine === "string" && /^\s*if\b/.test(nextLine);
}

function removeBlankLinesBeforeGuardComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const normalized: string[] = [];
    const length = lines.length;
    let previousNonBlankTrimmed: string | null = null;

    for (let index = 0; index < length; index += 1) {
        const line = lines[index];
        const trimmedLine = line.trim();
        const isBlankLine = trimmedLine.length === 0;

        if (
            isBlankLine &&
            index + 1 < length &&
            isPlainLineComment(lines[index + 1]) &&
            isGuardCommentSequence(lines, index + 1) &&
            previousNonBlankTrimmed?.endsWith("{")
        ) {
            continue;
        }

        normalized.push(line);
        if (!isBlankLine) {
            previousNonBlankTrimmed = trimmedLine;
        }
    }

    return normalized.join("\n");
}

function ensureTrailingNewline(formatted: string): string {
    return formatted.endsWith("\n") ? formatted : `${formatted}\n`;
}

/**
 * Ensures a single blank line before any top-level decorative block comment that opens
 * with a slash-asterisk pair followed by 20 or more forward slashes.
 *
 * These banners act as visual section dividers. Adding a blank line before them
 * deterministically (rather than consulting the original source) satisfies the
 * formatter-boundary contract (target-state.md section 3.2) while keeping output consistent.
 */
export function ensureBlankLineBeforeTopLevelDecorativeBlockComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];
    let previousLine: string | undefined;

    for (const line of lines) {
        if (isTopLevelDecorativeBlockComment(line) && isNonEmptyTrimmedString(previousLine)) {
            result.push("");
        }

        result.push(line);
        previousLine = line;
    }

    return result.join("\n");
}

/**
 * Ensures a single blank line before any top-level slash-only decorative banner:
 * a line at column 0 consisting of 21 or more consecutive forward slashes and no other
 * content (e.g. `////////////////////////////////////////`).
 *
 * These banners act as visual section delimiters. The rule is applied deterministically
 * (the original source is not consulted) in accordance with target-state.md section 3.2.
 *
 * The blank line is only inserted when the preceding line is non-blank and not itself
 * a top-level line comment — the same guard used by `ensureBlankLineBeforeTopLevelLineComments`.
 * This prevents inserting an extra blank line in the middle of a slash-banner triplet
 * where both the opening and closing lines are pure-slash and only a label line separates them.
 */
export function ensureBlankLineBeforeTopLevelSlashOnlyBanners(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];
    let previousLine: string | undefined;

    for (const line of lines) {
        if (isTopLevelSlashOnlyBanner(line) && shouldInsertBlankLineBeforeTopLevelComment(previousLine)) {
            result.push("");
        }

        result.push(line);
        previousLine = line;
    }

    return result.join("\n");
}

export function normalizeFormattedOutput(formatted: string): string {
    const normalized = [
        collapseDuplicateBlankLines,
        collapseBlockOpeningBlankLines,
        ensureTrailingNewline,
        collapseDuplicateBlankLines,
        normalizeInlineTrailingCommentSpacing,
        normalizeSingleCommentBlockIndentation,
        ensureBlankLineBeforeTopLevelLineComments,
        ensureBlankLineBeforeTopLevelDecorativeBlockComments,
        ensureBlankLineBeforeTopLevelSlashOnlyBanners,
        trimDecorativeCommentBlankLines,
        collapseDuplicateBlankLines,
        collapseWhitespaceOnlyBlankLines,
        collapseLineCommentToBlockCommentBlankLines,
        removeBlankLinesBeforeGuardComments
    ].reduce<string>((current, step) => step(current), formatted);

    return collapseWhitespaceOnlyBlankLines(normalized);
}
