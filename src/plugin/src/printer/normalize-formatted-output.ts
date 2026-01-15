import { Core } from "@gml-modules/core";

const { isNonEmptyString, isNonEmptyTrimmedString } = Core;

const EMPTY_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format is ended and empty but not assigned, then it does nothing and should be removed";
const KEEP_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format might be completed within a function call, then it should be kept";

const VERTEX_FORMAT_FUNCTION_BEGIN_PATTERN = /(vertex_format_begin\(\);\n)(?:[ \t]*\n)+([^\n]+)/g;
const CUSTOM_FUNCTION_CALL_TO_FORMAT_END_PATTERN = /([^\n]+\);\s*)\n(?:[ \t]*\n)+([^\n]*vertex_format_end\(\);)/g;

const MULTIPLE_BLANK_LINE_PATTERN = /\n{3,}/g;
const WHITESPACE_ONLY_BLANK_LINE_PATTERN = /\n[ \t]+\n/g;
const LINE_COMMENT_TO_BLOCK_COMMENT_BLANK_PATTERN = /(\/\/(?!\/)[^\n]*\n)(?:\s*\n)+(?=\s*\/\*)/g;
const FUNCTION_TAG_CLEANUP_PATTERN = /\/\/\/\s*@(?:func|function)\b[^\n]*(?:\n)?/gi;
const BLOCK_OPENING_BLANK_PATTERN = /\{\n(?:[ \t]*\n){1,}(?!\s*(?:\/\/\/|\/\*))/g;
const DECORATIVE_COMMENT_BLANK_PATTERN = /\{\n[ \t]+\n(?=\s*\/\/)/g;

const INLINE_TRAILING_COMMENT_SPACING_PATTERN = /(?<=[^\s/,])[ \t]{2,}(?=\/\/(?!\/))/g;

function stripInlineLineComment(line: string): string {
    const commentIndex = line.indexOf("//");
    return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function isSimpleFunctionCallLine(line: string): boolean {
    const trimmed = stripInlineLineComment(line).trim();
    if (!trimmed.endsWith(";")) {
        return false;
    }

    const withoutSemicolon = trimmed.slice(0, -1).trim();
    const parenIndex = withoutSemicolon.indexOf("(");
    if (parenIndex === -1) {
        return false;
    }

    const identifierPortion = withoutSemicolon.slice(0, parenIndex).trim();
    if (identifierPortion.length === 0 || identifierPortion.includes("=")) {
        return false;
    }

    return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(identifierPortion);
}

function isVertexFormatEndAssignmentLine(line: string): boolean {
    const trimmed = stripInlineLineComment(line).trim();
    const normalized = trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed;
    return /^(?:const|let|var\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=\s*vertex_format_end\(\)$/.test(
        normalized
    );
}

function ensureBlankLineBetweenVertexFormatComments(formatted: string): string {
    const target = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    const replacement = `${EMPTY_VERTEX_FORMAT_COMMENT_TEXT}\n\n${KEEP_VERTEX_FORMAT_COMMENT_TEXT}`;
    return formatted.includes(target) ? formatted.replace(target, replacement) : formatted;
}

function collapseVertexFormatBeginSpacing(formatted: string): string {
    const collapsedBegin = formatted.replaceAll(
        VERTEX_FORMAT_FUNCTION_BEGIN_PATTERN,
        (match, prefix, candidateLine) => {
            if (!isSimpleFunctionCallLine(candidateLine)) {
                return match;
            }

            return `${prefix}${candidateLine}`;
        }
    );

    return collapseCustomFunctionToFormatEndSpacing(collapsedBegin);
}

function collapseCustomFunctionToFormatEndSpacing(formatted: string): string {
    return formatted.replaceAll(
        CUSTOM_FUNCTION_CALL_TO_FORMAT_END_PATTERN,
        (match, functionLine, formatLine) => {
            if (!isSimpleFunctionCallLine(functionLine) || !isVertexFormatEndAssignmentLine(formatLine)) {
                return match;
            }

            return `${functionLine}\n${formatLine}`;
        }
    );
}

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

function stripFunctionTagComments(formatted: string): string {
    return formatted.replaceAll(FUNCTION_TAG_CLEANUP_PATTERN, "");
}

function normalizeInlineTrailingCommentSpacing(formatted: string): string {
    return formatted.replaceAll(INLINE_TRAILING_COMMENT_SPACING_PATTERN, " ");
}

function extractLineCommentPayload(line: string): string | null {
    const trimmed = line.trim();
    if (trimmed.startsWith("///")) {
        return trimmed.slice(3).trim();
    }

    if (trimmed.startsWith("//")) {
        return trimmed.slice(2).trim();
    }

    return null;
}

function removeDuplicateDocLikeLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith("///")) {
            const docPayload = extractLineCommentPayload(line);
            const previousLine = result.at(-1);
            if (docPayload !== null && typeof previousLine === "string") {
                const previousPayload = extractLineCommentPayload(previousLine);
                if (previousPayload !== null && previousPayload === docPayload) {
                    continue;
                }
            }
        }

        result.push(line);
    }

    return result.join("\n");
}

function ensureBlankLineBeforeTopLevelLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];

    for (const line of lines) {
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (isPlainLineComment && result.length > 0) {
            const previousLine = result.at(-1);
            const previousTrimmedStart = typeof previousLine === "string" ? previousLine.trimStart() : undefined;
            const isPreviousPlainLineComment =
                typeof previousLine === "string" &&
                previousTrimmedStart !== undefined &&
                previousTrimmedStart.startsWith("//") &&
                !previousTrimmedStart.startsWith("///") &&
                previousTrimmedStart === previousLine;
            if (isNonEmptyTrimmedString(previousLine) && previousLine.trim() !== "}" && !isPreviousPlainLineComment) {
                result.push("");
            } else if (typeof previousLine === "string" && previousLine.trim() === "}") {
                result.push("");
            }
        }

        result.push(line);
    }

    return result.join("\n");
}

function isPlainLineCommentLine(line: string | undefined): boolean {
    if (typeof line !== "string") {
        return false;
    }

    const trimmed = line.trimStart();
    return trimmed.startsWith("//") && !trimmed.startsWith("///");
}

function getNextNonBlankLine(lines: string[], startIndex: number): string | undefined {
    for (let index = startIndex; index < lines.length; index += 1) {
        const current = lines[index];
        if (current.trim().length > 0) {
            return current;
        }
    }

    return undefined;
}

function getPreviousNonBlankLine(lines: string[]): string | undefined {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index].trim().length > 0) {
            return lines[index];
        }
    }

    return undefined;
}

function isGuardCommentSequence(lines: string[], commentIndex: number): boolean {
    const nextLine = getNextNonBlankLine(lines, commentIndex + 1);
    return typeof nextLine === "string" && /^\s*if\b/.test(nextLine);
}

function removeBlankLinesBeforeGuardComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const normalized: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (
            line.trim().length === 0 &&
            index + 1 < lines.length &&
            isPlainLineCommentLine(lines[index + 1]) &&
            isGuardCommentSequence(lines, index + 1) &&
            getPreviousNonBlankLine(normalized)?.trim().endsWith("{")
        ) {
            continue;
        }

        normalized.push(line);
    }

    return normalized.join("\n");
}

function trimWhitespaceAfterBlockComments(formatted: string): string {
    return formatted.replaceAll(/\*\/\r?\n[ \t]+/g, "*/\n");
}

function collectLineCommentTrailingWhitespace(source: string): Map<string, string[]> {
    const lines = source.split(/\r?\n/);
    const map = new Map<string, string[]>();

    for (const line of lines) {
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (!isPlainLineComment) {
            continue;
        }

        const withoutTrailing = line.replace(/[ \t]+$/, "");
        const trailingWhitespace = line.slice(withoutTrailing.length);
        if (trailingWhitespace.length === 0) {
            continue;
        }

        const normalized = line.trim();
        const queue = map.get(normalized) ?? [];
        queue.push(trailingWhitespace);
        map.set(normalized, queue);
    }

    return map;
}

function reapplyLineCommentTrailingWhitespace(formatted: string, source: string): string {
    const whitespaceMap = collectLineCommentTrailingWhitespace(source);
    if (whitespaceMap.size === 0) {
        return formatted;
    }

    const lines = formatted.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmedStart = line.trimStart();
        const isPlainLineComment =
            trimmedStart.startsWith("//") && !trimmedStart.startsWith("///") && trimmedStart === line;

        if (!isPlainLineComment) {
            continue;
        }

        const normalized = line.trim();
        const queue = whitespaceMap.get(normalized);
        if (!queue || queue.length === 0) {
            continue;
        }

        const trailing = queue.shift();
        if (isNonEmptyString(trailing) && !line.endsWith(trailing)) {
            lines[index] = `${line}${trailing}`;
        }
    }

    return lines.join("\n");
}

export function normalizeFormattedOutput(formatted: string, source: string): string {
    const normalized = ensureBlankLineBetweenVertexFormatComments(formatted);
    const singleBlankLines = collapseDuplicateBlankLines(normalized);
    const collapsedBlockOpenings = collapseBlockOpeningBlankLines(singleBlankLines);
    const normalizedCleaned = collapsedBlockOpenings.endsWith("\n")
        ? collapsedBlockOpenings
        : `${collapsedBlockOpenings}\n`;
    const withoutFunctionTags = stripFunctionTagComments(normalizedCleaned);
    const collapsedAfterStrip = collapseDuplicateBlankLines(withoutFunctionTags);
    const dedupedComments = removeDuplicateDocLikeLineComments(collapseVertexFormatBeginSpacing(collapsedAfterStrip));
    const normalizedCommentSpacing = normalizeInlineTrailingCommentSpacing(dedupedComments);
    const spacedComments = ensureBlankLineBeforeTopLevelLineComments(normalizedCommentSpacing);
    const trimmedDecorativeBlanks = trimDecorativeCommentBlankLines(spacedComments);
    const collapsedAfterDecorativeTrim = collapseDuplicateBlankLines(trimmedDecorativeBlanks);
    const trimmedAfterBlockComments = trimWhitespaceAfterBlockComments(collapsedAfterDecorativeTrim);
    const collapsedWhitespaceOnlyLines = collapseWhitespaceOnlyBlankLines(trimmedAfterBlockComments);
    const normalizedLineCommentBlockSpacing = collapseLineCommentToBlockCommentBlankLines(collapsedWhitespaceOnlyLines);
    const cleanedGuardComments = removeBlankLinesBeforeGuardComments(normalizedLineCommentBlockSpacing);
    const afterTrailingWhitespace = reapplyLineCommentTrailingWhitespace(cleanedGuardComments, source);
    return collapseWhitespaceOnlyBlankLines(afterTrailingWhitespace);
}
