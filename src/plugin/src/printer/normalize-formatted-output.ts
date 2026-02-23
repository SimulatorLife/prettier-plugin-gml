import { Core } from "@gml-modules/core";

const { isNonEmptyTrimmedString } = Core;

const EMPTY_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format is ended and empty but not assigned, then it does nothing and should be removed";
const KEEP_VERTEX_FORMAT_COMMENT_TEXT =
    "// If a vertex format might be completed within a function call, then it should be kept";

const VERTEX_FORMAT_FUNCTION_BEGIN_PATTERN = /(vertex_format_begin\(\);\n)(?:[ \t]*\n)+([^\n]+)/g;
const CUSTOM_FUNCTION_CALL_TO_FORMAT_END_PATTERN = /([^\n]+\);\s*)\n(?:[ \t]*\n)+([^\n]*vertex_format_end\(\);)/g;

const MULTIPLE_BLANK_LINE_PATTERN = /\n{3,}/g;
const WHITESPACE_ONLY_BLANK_LINE_PATTERN = /\n[ \t]+\n/g;
const LINE_COMMENT_TO_BLOCK_COMMENT_BLANK_PATTERN = /(\/\/(?!\/)[^\n]*\n)(?:\s*\n)+(?=\s*\/\*)/g;
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
    return formatted.replaceAll(CUSTOM_FUNCTION_CALL_TO_FORMAT_END_PATTERN, (match, functionLine, formatLine) => {
        if (!isSimpleFunctionCallLine(functionLine) || !isVertexFormatEndAssignmentLine(formatLine)) {
            return match;
        }

        return `${functionLine}\n${formatLine}`;
    });
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
        let normalizedExtraIndent: string | null = null;
        if (extraIndent === "        ") {
            normalizedExtraIndent = "    ";
        } else if (extraIndent === "\t\t") {
            normalizedExtraIndent = "\t";
        }

        if (normalizedExtraIndent === null) {
            continue;
        }

        lines[index] = `${closingIndent}${normalizedExtraIndent}${currentTrimmed}`;
    }

    return lines.join("\n");
}

function extractLineCommentPayload(trimmedStart: string): string | null {
    if (trimmedStart.startsWith("///")) {
        return trimmedStart.slice(3).trim();
    }

    if (trimmedStart.startsWith("//")) {
        return trimmedStart.slice(2).trim();
    }

    return null;
}

const DOC_LIKE_LINE_PATTERN = /^\/\/\/|^\/\/\s*\/(\s|$)|^\/\/\s*@/;

type PlainLineCommentInfo = {
    trimmedStart: string;
    normalized: string;
    isTopLevel: boolean;
};

function getPlainLineCommentInfo(line: string | undefined): PlainLineCommentInfo | null {
    if (typeof line !== "string") {
        return null;
    }

    const trimmedStart = line.trimStart();
    if (!trimmedStart.startsWith("//") || trimmedStart.startsWith("///")) {
        return null;
    }

    return {
        trimmedStart,
        normalized: trimmedStart.trimEnd(),
        isTopLevel: trimmedStart === line
    };
}

function isDocLikeLine(line: string): boolean {
    const trimmed = line.trimStart();
    return DOC_LIKE_LINE_PATTERN.test(trimmed);
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

function hasRepeatedBlock(trimmedLines: string[], segmentLength: number): boolean {
    const baseSegment = trimmedLines.slice(0, segmentLength);

    for (let offset = segmentLength; offset < trimmedLines.length; offset += segmentLength) {
        for (let index = 0; index < segmentLength; index += 1) {
            if (baseSegment[index] !== trimmedLines[offset + index]) {
                return false;
            }
        }
    }

    return true;
}

function findRepeatedSegmentLength(lines: string[]): number {
    // Trim once to avoid repeated string allocations during segment checks.
    const trimmedLines = lines.map((line) => line.trim());

    for (let segmentLength = 1; segmentLength <= Math.floor(trimmedLines.length / 2); segmentLength += 1) {
        if (trimmedLines.length % segmentLength !== 0) {
            continue;
        }

        if (hasRepeatedBlock(trimmedLines, segmentLength)) {
            return segmentLength;
        }
    }

    return 0;
}

function dedupeDocBlock(lines: string[]): string[] {
    if (lines.length === 0) {
        return lines;
    }

    const segmentLength = findRepeatedSegmentLength(lines);
    if (segmentLength > 0) {
        return dedupeDocBlock(lines.slice(0, segmentLength));
    }

    const filtered: string[] = [];
    let previousDocPayload: string | null = null;

    for (const line of lines) {
        const trimmedStart = line.trimStart();
        const docPayload = extractLineCommentPayload(trimmedStart);

        if (docPayload === null) {
            previousDocPayload = null;
        } else {
            if (docPayload === previousDocPayload) {
                continue;
            }
            previousDocPayload = docPayload;
        }

        filtered.push(line);
    }

    return filtered;
}

function removeDuplicateDocLikeLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];
    let docBlockLines: string[] = [];
    let insideBlockComment = false;

    const flushDocBlock = () => {
        if (docBlockLines.length === 0) {
            return;
        }

        const deduped = dedupeDocBlock(docBlockLines);
        result.push(...deduped);
        docBlockLines = [];
    };

    for (const line of lines) {
        if (insideBlockComment) {
            flushDocBlock();
            result.push(line);
            insideBlockComment = updateBlockCommentState(line, insideBlockComment);
            continue;
        }

        if (isDocLikeLine(line)) {
            docBlockLines.push(line);
            insideBlockComment = updateBlockCommentState(line, insideBlockComment);
            continue;
        }

        flushDocBlock();
        result.push(line);
        insideBlockComment = updateBlockCommentState(line, insideBlockComment);
    }

    flushDocBlock();
    return result.join("\n");
}

function ensureBlankLineBeforeTopLevelLineComments(formatted: string): string {
    const lines = formatted.split(/\r?\n/);
    const result: string[] = [];
    let previousLine: string | undefined;
    let insideBlockComment = false;

    for (const line of lines) {
        if (
            !insideBlockComment &&
            isTopLevelPlainLineComment(line) &&
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

function isTopLevelPlainLineComment(line: string | undefined): boolean {
    const info = getPlainLineCommentInfo(line);
    return info !== null && info.isTopLevel;
}

function shouldInsertBlankLineBeforeTopLevelComment(previousLine: string | undefined): boolean {
    return isNonEmptyTrimmedString(previousLine) && !isTopLevelPlainLineComment(previousLine);
}

function isPlainLineCommentLine(line: string | undefined): boolean {
    return getPlainLineCommentInfo(line) !== null;
}

function getNextNonBlankLine(lines: string[], startIndex: number): string | undefined {
    const length = lines.length;
    for (let index = startIndex; index < length; index += 1) {
        const current = lines[index];
        if (current.trim().length > 0) {
            return current;
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
    const length = lines.length;
    let previousNonBlankTrimmed: string | null = null;

    for (let index = 0; index < length; index += 1) {
        const line = lines[index];
        const trimmedLine = line.trim();
        const isBlankLine = trimmedLine.length === 0;

        if (
            isBlankLine &&
            index + 1 < length &&
            isPlainLineCommentLine(lines[index + 1]) &&
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

type NormalizationStep = (formatted: string) => string;

function applyNormalizationSteps(formatted: string, steps: readonly NormalizationStep[]): string {
    return steps.reduce((current, step) => step(current), formatted);
}

function ensureTrailingNewline(formatted: string): string {
    return formatted.endsWith("\n") ? formatted : `${formatted}\n`;
}

export function normalizeFormattedOutput(formatted: string): string {
    const normalized = applyNormalizationSteps(formatted, [
        ensureBlankLineBetweenVertexFormatComments,
        collapseDuplicateBlankLines,
        collapseBlockOpeningBlankLines,
        ensureTrailingNewline,
        collapseDuplicateBlankLines,
        collapseVertexFormatBeginSpacing,
        removeDuplicateDocLikeLineComments,
        normalizeInlineTrailingCommentSpacing,
        normalizeSingleCommentBlockIndentation,
        ensureBlankLineBeforeTopLevelLineComments,
        trimDecorativeCommentBlankLines,
        collapseDuplicateBlankLines,
        collapseWhitespaceOnlyBlankLines,
        collapseLineCommentToBlockCommentBlankLines,
        removeBlankLinesBeforeGuardComments
    ]);

    return collapseWhitespaceOnlyBlankLines(normalized);
}
