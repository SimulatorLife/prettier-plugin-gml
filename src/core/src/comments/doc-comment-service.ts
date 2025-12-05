// TODO: This fie is too large. We need to make the doc-comment functionality a sub-module-directory and split this file into multiple smaller files (e.g. one for constants). Some functionality is generic AST functionality that could be moved to @gml-modules/core

import {
    asArray,
    capitalize,
    coercePositiveIntegerOption,
    createResolverController,
    createEnvConfiguredValueWithFallback,
    findLastIndex,
    getNonEmptyString,
    getNonEmptyTrimmedString,
    isNonEmptyArray,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toFiniteNumber,
    toMutableArray,
    toTrimmedString
} from "../utils/index.js";
import {
    getIdentifierText,
    getNodeName,
    isUndefinedSentinel
} from "../ast/node-helpers.js";
import { getNodeEndIndex, getNodeStartIndex } from "../ast/locations.js";
import {
    getCommentArray,
    type DocCommentLines,
    type MutableDocCommentLines
} from "./comment-utils.js";
import { normalizeOptionalParamToken } from "./optional-param-normalization.js";
import {
    DocCommentPrinterDependencies,
    getDocCommentPrinterDependencies
} from "./doc-comment-printer-dependencies.js";

export type DocCommentMetadata = {
    tag: string;
    name?: string | null;
    type?: string | null;
};

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";

const RETURN_DOC_TAG_PATTERN = /^\/\/\/\s*@returns\b/i;
const LEGACY_RETURNS_DESCRIPTION_PATTERN = /^(.+?)\s+-\s+(.*)$/; // simplified pattern for core

const KNOWN_TYPE_IDENTIFIERS = Object.freeze([
    "real",
    "string",
    "bool",
    "boolean",
    "void",
    "undefined",
    "pointer",
    "array",
    "struct",
    "id",
    "asset",
    "any",
    "function",
    "constant"
]);

const KNOWN_TYPES = new Set(
    KNOWN_TYPE_IDENTIFIERS.map((identifier) => identifier.toLowerCase())
);

const DOC_COMMENT_TAG_PATTERN = /^\/\/\/\s*@/i;
const DOC_COMMENT_ALT_TAG_PATTERN = /^\/\/\s*\/\s*@/i;

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = 100;
const MIN_DOC_COMMENT_WRAP_WIDTH = 1;

export const docCommentMaxWrapWidthConfig =
    createEnvConfiguredValueWithFallback({
        defaultValue: DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        envVar: DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR,
        resolve: (raw) => {
            if (raw === "Infinity" || raw === Infinity) {
                return Infinity;
            }
            const num = toFiniteNumber(raw);
            return num !== null && num >= MIN_DOC_COMMENT_WRAP_WIDTH
                ? num
                : null;
        }
    });

export function resolveDocCommentWrapWidth(options: any) {
    const candidate = options?.docCommentMaxWrapWidth;
    if (typeof candidate === NUMBER_TYPE) {
        return candidate;
    }

    if (candidate === Infinity) {
        return Infinity;
    }

    return docCommentMaxWrapWidthConfig.get();
}

function isDocCommentTagLine(line: unknown) {
    if (typeof line !== STRING_TYPE) {
        return false;
    }

    const trimmed = toTrimmedString(line);
    return (
        DOC_COMMENT_TAG_PATTERN.test(trimmed) ||
        DOC_COMMENT_ALT_TAG_PATTERN.test(trimmed)
    );
}

export function parseDocCommentMetadata(
    line: unknown
): DocCommentMetadata | null {
    if (typeof line !== "string") {
        return null;
    }

    const trimmed = line.trim();
    const match = trimmed.match(/^\/\/\/\s*@([a-z]+)\b\s*(.*)$/i);
    if (!match) {
        return null;
    }

    const tag = match[1].toLowerCase();
    const remainder = match[2].trim();

    if (tag === "param") {
        let paramSection = remainder;
        let type = null;

        if (paramSection.startsWith("{")) {
            const typeMatch = paramSection.match(/^\{([^}]*)\}\s*(.*)$/);
            if (typeMatch) {
                type = typeMatch[1]?.trim() ?? null;
                paramSection = typeMatch[2] ?? "";
            }
        }

        let name = null;
        if (paramSection.startsWith("[")) {
            let depth = 0;
            for (let i = 0; i < paramSection.length; i += 1) {
                const char = paramSection[i];
                if (char === "[") {
                    depth += 1;
                } else if (char === "]") {
                    depth -= 1;
                    if (depth === 0) {
                        name = paramSection.slice(0, i + 1);
                        break;
                    }
                }
            }
        }

        if (!name) {
            const paramMatch = paramSection.match(/^(\S+)/);
            name = paramMatch ? paramMatch[1] : null;
        }

        return {
            tag,
            name,
            type: type ?? null
        };
    }

    return { tag, name: remainder };
}

function isInlineWhitespace(charCode: number) {
    return (
        charCode === 9 || // Tab
        charCode === 10 || // Line feed
        charCode === 13 || // Carriage return
        charCode === 32 // Space
    );
}

/**
 * Determines whether a line resembles a doc-style summary (///, // /, or @-prefixed).
 */
export function isDocLikeLeadingLine(value: unknown) {
    if (typeof value !== STRING_TYPE) {
        return false;
    }

    const trimmed = (value as string).trim();
    return (
        trimmed.startsWith("///") ||
        /^\/\/\s*\/\s*/.test(trimmed) ||
        /^\/+\s*@/.test(trimmed)
    );
}

/**
 * Checks if the provided text contains a comment line immediately before the given index.
 */
export function hasCommentImmediatelyBefore(text: unknown, index: unknown) {
    if (typeof text !== STRING_TYPE || typeof index !== NUMBER_TYPE) {
        return false;
    }

    const normalizedText = text as string;
    const normalizedIndex = index as number;

    let cursor = normalizedIndex - 1;
    while (
        cursor >= 0 &&
        isInlineWhitespace(normalizedText.charCodeAt(cursor))
    ) {
        cursor -= 1;
    }

    if (cursor < 0) {
        return false;
    }

    const lineEndExclusive = cursor + 1;
    while (cursor >= 0) {
        const charCode = normalizedText.charCodeAt(cursor);
        if (charCode === 10 || charCode === 13) {
            break;
        }
        cursor -= 1;
    }

    let lineStart = cursor + 1;
    while (
        lineStart < lineEndExclusive &&
        isInlineWhitespace(normalizedText.charCodeAt(lineStart))
    ) {
        lineStart += 1;
    }

    if (lineStart >= lineEndExclusive) {
        return false;
    }

    let lineEnd = lineEndExclusive - 1;
    while (
        lineEnd >= lineStart &&
        isInlineWhitespace(normalizedText.charCodeAt(lineEnd))
    ) {
        lineEnd -= 1;
    }

    if (lineEnd < lineStart) {
        return false;
    }

    const first = normalizedText.charCodeAt(lineStart);
    const second =
        lineStart + 1 <= lineEnd
            ? normalizedText.charCodeAt(lineStart + 1)
            : -1;

    if (first === 47) {
        if (second === 47 || second === 42) {
            return true;
        }
    } else if (first === 42) {
        return true;
    }

    return (
        lineEnd >= lineStart + 1 &&
        normalizedText.charCodeAt(lineEnd) === 47 &&
        normalizedText.charCodeAt(lineEnd - 1) === 42
    );
}

/**
 * Resolves the node's start index using an optional locator helper from the printer.
 */
function getNodeStartIndexForDocComments(node: any, locStart: unknown) {
    if (!node) {
        return null;
    }

    if (typeof locStart === "function") {
        const resolved = locStart(node);
        if (Number.isInteger(resolved)) {
            return resolved;
        }
    }

    const startProp = node.start;
    if (typeof startProp === NUMBER_TYPE) {
        return startProp;
    }

    if (startProp && typeof startProp.index === NUMBER_TYPE) {
        return startProp.index;
    }

    return null;
}

export function collectSyntheticDocCommentLines(
    node: any,
    options: any,
    programNode: any,
    sourceText: string | null,
    dependencies?: DocCommentPrinterDependencies
) {
    const deps =
        dependencies ?? getDocCommentPrinterDependencies();
    const rawComments = getCommentArray(node);
    if (
        node.id === "scr_create_fx" ||
        (node.id && node.id.name === "scr_create_fx")
    ) {
        console.log(
            "[DEBUG Core] collectSyntheticDocCommentLines for scr_create_fx"
        );
        console.log("[DEBUG Core] rawComments length:", rawComments.length);
    }
    if (!isNonEmptyArray(rawComments)) {
        // No node-level comments exist; fallback collection happens later.
    }

    const lineCommentOptions = deps.resolveLineCommentOptions(options);
    const existingDocLines: string[] = [];
    const remainingComments: any[] = [];

    const nodeStartIndex = getNodeStartIndexForDocComments(node, options);
    for (const comment of rawComments) {
        if (!comment || comment.type !== "CommentLine") {
            remainingComments.push(comment);
            continue;
        }

        let formatted = deps.formatLineComment(
            comment,
            lineCommentOptions
        );
        const rawText = deps.getLineCommentRawText(comment);
        const trimmedRaw = typeof rawText === STRING_TYPE ? rawText.trim() : "";
        const isFormattedDocStyle =
            typeof formatted === STRING_TYPE &&
            formatted.trim().startsWith("///");
        const trimmedWithoutSlashes = trimmedRaw.replace(/^\/+/, "").trim();
        const hasDocTagAfterSlash = /^\/+\s*@/.test(trimmedRaw);
        const isDocStyleSlash = /^\/\/\s+\/\s*/.test(trimmedRaw);
        const isBlockDocLike =
            trimmedRaw.startsWith("/*") &&
            trimmedWithoutSlashes.startsWith("@");
        const isRawDocLike =
            trimmedRaw.startsWith("///") ||
            hasDocTagAfterSlash ||
            isDocStyleSlash ||
            isBlockDocLike;
        if (!isFormattedDocStyle && !isRawDocLike) {
            remainingComments.push(comment);
            continue;
        }

        if (
            (!formatted || formatted.trim().length === 0) &&
            isRawDocLike &&
            typeof trimmedRaw === STRING_TYPE &&
            trimmedRaw.length > 0
        ) {
            const inner = trimmedRaw.replace(/^\/*\s*/, "").trim();
            formatted = inner.length > 0 ? `/// ${inner}` : "///";
        }

        const commentStartIndex =
            comment && typeof comment.start === NUMBER_TYPE
                ? comment.start
                : comment &&
                    comment.start &&
                    typeof comment.start.index === NUMBER_TYPE
                  ? comment.start.index
                  : null;

        const isBeforeNode =
            Number.isInteger(commentStartIndex) &&
            Number.isInteger(nodeStartIndex) &&
            commentStartIndex < nodeStartIndex;
        const considerAsLeading =
            isBeforeNode || comment?.placement === "leading";
        if (!considerAsLeading) {
            remainingComments.push(comment);
            continue;
        }

        comment.printed = true;
        if (typeof formatted === "string" && formatted.includes("\n")) {
            const parts = formatted.split(/\r?\n/);
            for (const part of parts) {
                existingDocLines.push(part);
            }
        } else {
            existingDocLines.push(formatted);
        }
    }

    if (existingDocLines.length === 0 && programNode) {
        const programCommentArray = getCommentArray(programNode);
        const programHasComments = isNonEmptyArray(programCommentArray);
        if (programHasComments) {
            const programComments = getCommentArray(programNode);
            const nodeStartIndexFinal = getNodeStartIndexForDocComments(
                node,
                options
            );
            if (Number.isInteger(nodeStartIndexFinal)) {
                const docCandidates: any[] = [];
                let anchorIndex = nodeStartIndexFinal;
                for (let i = programComments.length - 1; i >= 0; --i) {
                    const pc = programComments[i];
                    if (!pc || pc.type !== "CommentLine" || pc.printed) {
                        continue;
                    }
                    let pcEndIndex =
                        typeof pc.end === NUMBER_TYPE
                            ? pc.end
                            : (pc?.end?.index ?? null);
                    const pcStartIndex =
                        typeof pc.start === NUMBER_TYPE
                            ? pc.start
                            : (pc?.start?.index ?? null);
                    if (!Number.isInteger(pcEndIndex)) {
                        pcEndIndex = Number.isInteger(pcStartIndex)
                            ? pcStartIndex
                            : null;
                    }
                    if (
                        !Number.isInteger(pcEndIndex) ||
                        pcEndIndex >= anchorIndex
                    ) {
                        continue;
                    }

                    const rawText = deps.getLineCommentRawText(pc);
                    const trimmedRaw =
                        typeof rawText === STRING_TYPE ? rawText.trim() : "";
                    const trimmedWithoutSlashes = trimmedRaw
                        .replace(/^\/+/, "")
                        .trim();
                    const hasDocTagAfterSlash = /^\/+\s*@/.test(trimmedRaw);
                    const isDocStyleSlash = /^\/\/\s+\/\s*/.test(trimmedRaw);
                    const isBlockDocLike =
                        trimmedRaw.startsWith("/*") &&
                        trimmedWithoutSlashes.startsWith("@");
                    const isRawDocLike =
                        trimmedRaw.startsWith("///") ||
                        hasDocTagAfterSlash ||
                        isDocStyleSlash ||
                        isBlockDocLike;
                    if (!isRawDocLike) {
                        break;
                    }
                    let allowCandidate = true;
                    if (
                        typeof sourceText === STRING_TYPE &&
                        Number.isInteger(pcEndIndex)
                    ) {
                        const gapText = sourceText.slice(
                            pcEndIndex,
                            anchorIndex
                        );
                        const blankLines = (gapText.match(/\n/g) || []).length;
                        if (blankLines >= 2) {
                            allowCandidate = false;
                        }
                    }
                    if (!allowCandidate) {
                        break;
                    }
                    docCandidates.unshift(pc);
                    anchorIndex = Number.isInteger(pcStartIndex)
                        ? pcStartIndex
                        : pcEndIndex;
                }

                if (docCandidates.length > 0) {
                    const fallbackOptions = deps.resolveLineCommentOptions(
                        options
                    );
                    const collected = docCandidates.map((c) =>
                        deps.formatLineComment(c, fallbackOptions)
                    );
                    const flattenedCollected: string[] = [];
                    for (const entry of collected) {
                        if (typeof entry === "string" && entry.includes("\n")) {
                            flattenedCollected.push(...entry.split(/\r?\n/));
                        } else if (typeof entry === "string") {
                            flattenedCollected.push(entry);
                        }
                    }
                    for (const c of docCandidates) {
                        c.printed = true;
                    }
                    return {
                        existingDocLines: flattenedCollected,
                        remainingComments: toMutableArray(rawComments)
                    };
                }
            }
        } else {
            if (
                typeof sourceText === STRING_TYPE &&
                Number.isInteger(nodeStartIndex)
            ) {
                const candidates: Array<{
                    text: string;
                    start: number;
                    end: number;
                }> = [];
                let anchor = nodeStartIndex;
                while (anchor > 0) {
                    const prevNewline = sourceText.lastIndexOf(
                        "\n",
                        anchor - 1
                    );
                    const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
                    const lineEnd = anchor === 0 ? 0 : anchor - 1;
                    const rawLine = sourceText.slice(lineStart, lineEnd + 1);
                    const trimmed = rawLine.trim();
                    const isBlank = trimmed.length === 0;
                    if (isBlank) {
                        const gapText = sourceText.slice(
                            lineStart,
                            nodeStartIndex
                        );
                        const blankLines = (gapText.match(/\n/g) || []).length;
                        if (blankLines >= 2) {
                            break;
                        }
                        anchor = lineStart - 1;
                        continue;
                    }
                    if (!/^\s*\/\//.test(trimmed)) {
                        break;
                    }
                    const isDocLike =
                        /^\/{2,}/.test(trimmed) ||
                        /^\/\/\s*\//.test(trimmed) ||
                        /^\/\s*@/.test(trimmed);
                    if (!isDocLike) {
                        break;
                    }
                    candidates.unshift({
                        text: rawLine,
                        start: lineStart,
                        end: lineEnd
                    });
                    anchor = lineStart - 1;
                }

                if (candidates.length > 0) {
                    const fallbackOptions = deps.resolveLineCommentOptions(
                        options
                    );
                    const formatted = candidates.map((c) => {
                        const matchNode = programCommentArray.find((pc) => {
                            const startIndex =
                                typeof pc?.start === NUMBER_TYPE
                                    ? pc.start
                                    : (pc?.start?.index ?? null);
                            return (
                                Number.isInteger(startIndex) &&
                                startIndex === c.start
                            );
                        });
                        if (matchNode) {
                            matchNode.printed = true;
                            return deps.formatLineComment(
                                matchNode,
                                fallbackOptions
                            );
                        }
                        const inner = c.text.replace(/^\s*\/+\s*/, "").trim();
                        return inner.length > 0 ? `/// ${inner}` : "///";
                    });
                    const flattenedFormatted: string[] = [];
                    for (const entry of formatted) {
                        if (typeof entry === "string" && entry.includes("\n")) {
                            flattenedFormatted.push(...entry.split(/\r?\n/));
                        } else if (typeof entry === "string") {
                            flattenedFormatted.push(entry);
                        }
                    }
                    return {
                        existingDocLines: flattenedFormatted,
                        remainingComments: toMutableArray(rawComments)
                    };
                }
            }
        }
    }

    return { existingDocLines, remainingComments };
}

export function collectLeadingProgramLineComments(
    node: any,
    programNode: any,
    options: any,
    sourceText: string | null,
    dependencies?: DocCommentPrinterDependencies
) {
    const deps =
        dependencies ?? getDocCommentPrinterDependencies();
    if (!node || !programNode) {
        return [];
    }

    const nodeStartIndex = getNodeStartIndexForDocComments(node, options);
    if (!Number.isInteger(nodeStartIndex)) {
        return [];
    }

    const programComments = getCommentArray(programNode);
    if (!isNonEmptyArray(programComments)) {
        return [];
    }

    const lineCommentOptions = deps.resolveLineCommentOptions(options);
    const leadingLines: string[] = [];
    let anchorIndex = nodeStartIndex;

    for (let i = programComments.length - 1; i >= 0; i -= 1) {
        const comment = programComments[i];
        if (!comment || comment.type !== "CommentLine" || comment.printed) {
            continue;
        }

        const commentEnd =
            typeof comment.end === NUMBER_TYPE
                ? comment.end
                : (comment?.end?.index ?? null);
        const commentStart =
            typeof comment.start === NUMBER_TYPE
                ? comment.start
                : (comment?.start?.index ?? null);

        if (!Number.isInteger(commentEnd) || commentEnd >= anchorIndex) {
            continue;
        }

        const formatted = deps.formatLineComment(
            comment,
            lineCommentOptions
        );
        const trimmed = toTrimmedString(formatted);

        if (
            trimmed.length === 0 ||
            trimmed.startsWith("///") ||
            /^\/\/\s*\/\s*/.test(trimmed) ||
            /^\s*@/.test(trimmed)
        ) {
            continue;
        }

        if (typeof sourceText === STRING_TYPE) {
            const gapText = sourceText.slice(commentEnd, anchorIndex);
            const blankLines = (gapText.match(/\n/g) || []).length;
            if (blankLines >= 2) {
                break;
            }
        }

        comment.printed = true;
        leadingLines.unshift(typeof formatted === STRING_TYPE ? formatted : "");
        anchorIndex = Number.isInteger(commentStart)
            ? commentStart
            : commentEnd;
    }

    return leadingLines;
}

export function collectAdjacentLeadingSourceLineComments(
    node: any,
    options: any,
    sourceText: string | null
) {
    if (!node || typeof sourceText !== STRING_TYPE) {
        return [];
    }

    const nodeStartIndex = getNodeStartIndexForDocComments(node, options);
    if (!Number.isInteger(nodeStartIndex)) {
        return [];
    }

    const leadingLines: string[] = [];
    let anchorIndex = nodeStartIndex;

    while (anchorIndex > 0) {
        const prevNewline = sourceText.lastIndexOf("\n", anchorIndex - 1);
        const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
        const lineEnd = anchorIndex === 0 ? 0 : anchorIndex - 1;
        const rawLine = sourceText.slice(lineStart, lineEnd + 1);
        const trimmed = rawLine.trim();

        if (trimmed.length === 0) {
            const gapText = sourceText.slice(lineStart, nodeStartIndex);
            const blankLines = (gapText.match(/\n/g) || []).length;
            if (blankLines >= 2) break;
            anchorIndex = lineStart - 1;
            continue;
        }

        if (!trimmed.startsWith("//")) {
            break;
        }

        if (
            trimmed.startsWith("///") ||
            /^\/\/\s*\//.test(trimmed) ||
            /^\s*@/.test(trimmed)
        ) {
            break;
        }

        leadingLines.unshift(rawLine);
        anchorIndex = lineStart - 1;
    }

    return leadingLines;
}

export function extractLeadingNonDocCommentLines(
    comments: any,
    options: any,
    dependencies?: DocCommentPrinterDependencies
) {
    const deps =
        dependencies ?? getDocCommentPrinterDependencies();
    if (!isNonEmptyArray(comments)) {
        return {
            leadingLines: [],
            remainingComments: asArray(comments)
        };
    }

    const lineCommentOptions = deps.resolveLineCommentOptions(options);
    const leadingLines: string[] = [];
    const remainingComments: any[] = [];
    let scanningLeadingComments = true;

    for (const comment of comments) {
        if (
            scanningLeadingComments &&
            comment &&
            comment.type === "CommentLine"
        ) {
            const formatted = deps.formatLineComment(
                comment,
                lineCommentOptions
            );
            const trimmed = toTrimmedString(formatted);

            if (trimmed.length === 0) {
                comment.printed = true;
                continue;
            }

            if (
                trimmed.startsWith("//") &&
                !trimmed.startsWith("///") &&
                !/^\/\/\s*\//.test(trimmed)
            ) {
                comment.printed = true;
                leadingLines.push(
                    typeof formatted === STRING_TYPE ? formatted : ""
                );
                continue;
            }
        }

        scanningLeadingComments = false;
        remainingComments.push(comment);
    }

    return { leadingLines, remainingComments };
}

export function dedupeReturnDocLines(
    lines: DocCommentLines | string[],
    {
        includeNonReturnLine
    }: {
        includeNonReturnLine?: (line: string, trimmed: string) => boolean;
    } = {}
) {
    const shouldIncludeNonReturn =
        typeof includeNonReturnLine === "function"
            ? includeNonReturnLine
            : () => true;

    const deduped: string[] = [];
    const seenReturnLines = new Set<string>();
    let removedAnyReturnLine = false;

    for (const line of lines) {
        if (typeof line !== STRING_TYPE) {
            deduped.push(line);
            continue;
        }

        const trimmed = toTrimmedString(line);
        if (!RETURN_DOC_TAG_PATTERN.test(trimmed)) {
            if (shouldIncludeNonReturn(line, trimmed)) {
                deduped.push(line);
            }
            continue;
        }

        if (trimmed.length === 0) {
            continue;
        }

        const key = trimmed.toLowerCase();
        if (seenReturnLines.has(key)) {
            removedAnyReturnLine = true;
            continue;
        }

        seenReturnLines.add(key);
        deduped.push(line);
    }

    return { lines: deduped as DocCommentLines, removed: removedAnyReturnLine };
}

export function reorderDescriptionLinesAfterFunction(
    docLines: DocCommentLines | string[]
): DocCommentLines {
    const normalizedDocLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];

    if (normalizedDocLines.length === 0) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionBlocks: number[][] = [];
    let earliestDescriptionIndex = Infinity;
    for (let index = 0; index < normalizedDocLines.length; index += 1) {
        const line = normalizedDocLines[index];
        if (
            typeof line !== STRING_TYPE ||
            !/^\/\/\/\s*@description\b/i.test(line.trim())
        ) {
            continue;
        }

        const blockIndices = [index];
        let lookahead = index + 1;
        while (lookahead < normalizedDocLines.length) {
            const nextLine = normalizedDocLines[lookahead];
            if (
                typeof nextLine === STRING_TYPE &&
                nextLine.startsWith("///") &&
                !parseDocCommentMetadata(nextLine)
            ) {
                blockIndices.push(lookahead);
                lookahead += 1;
                continue;
            }
            break;
        }

        descriptionBlocks.push(blockIndices);
        if (index < earliestDescriptionIndex) {
            earliestDescriptionIndex = index;
        }
        if (lookahead > index + 1) {
            index = lookahead - 1;
        }
    }

    if (descriptionBlocks.length === 0) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionStartIndices = descriptionBlocks.map((block) => block[0]);

    const functionIndex = normalizedDocLines.findIndex(
        (line) =>
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@function\b/i.test(line.trim())
    );

    if (functionIndex === -1) {
        return normalizedDocLines as DocCommentLines;
    }

    const firstReturnsIndex = normalizedDocLines.findIndex(
        (line, i) =>
            i > functionIndex &&
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@returns\b/i.test(line.trim())
    );
    const allDescriptionsPrecedeReturns = descriptionStartIndices.every(
        (idx) =>
            idx > functionIndex &&
            (firstReturnsIndex === -1 || idx < firstReturnsIndex)
    );

    if (
        earliestDescriptionIndex > functionIndex &&
        allDescriptionsPrecedeReturns
    ) {
        return normalizedDocLines as DocCommentLines;
    }

    const descriptionIndices = descriptionBlocks.flat();
    const descriptionIndexSet = new Set<number>(descriptionIndices);

    const descriptionLines: string[] = [];
    for (const block of descriptionBlocks) {
        for (const blockIndex of block) {
            const docLine = normalizedDocLines[blockIndex];
            if (typeof docLine !== STRING_TYPE) {
                continue;
            }

            if (/^\/\/\/\s*@description\b/i.test(docLine.trim())) {
                const metadata = parseDocCommentMetadata(docLine);
                const descriptionText =
                    typeof metadata?.name === STRING_TYPE
                        ? metadata.name.trim()
                        : "";
                if (!isNonEmptyTrimmedString(descriptionText)) {
                    descriptionLines.push(docLine);
                    continue;
                }

                descriptionLines.push(`/// @description ${descriptionText}`);
                continue;
            }

            descriptionLines.push(docLine);
        }
    }

    const filtered = normalizedDocLines.filter(
        (_line, idx) => !descriptionIndexSet.has(idx)
    );

    // Find insertion position after function
    let insertionIdx = filtered.findIndex(
        (line, i) =>
            i > functionIndex &&
            typeof line === STRING_TYPE &&
            /^\/\/\/\s*@returns\b/i.test(line.trim())
    );
    if (insertionIdx === -1) insertionIdx = filtered.length;

    const result = [
        ...filtered.slice(0, insertionIdx),
        ...descriptionLines,
        ...filtered.slice(insertionIdx)
    ];

    return result as DocCommentLines;
}

export function convertLegacyReturnsDescriptionLinesToMetadata(
    docLines: DocCommentLines | string[],
    opts: { normalizeDocCommentTypeAnnotations?: (line: string) => string } = {}
) {
    const normalizedLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];

    if (normalizedLines.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const preserveLeadingBlank =
        (normalizedLines as any)._suppressLeadingBlank === true;
    const preserveDescriptionBreaks =
        (normalizedLines as any)._preserveDescriptionBreaks === true;

    const convertedReturns: string[] = [];
    const retainedLines: string[] = [];

    // console.log("convertLegacyReturnsDescriptionLinesToMetadata opts:", opts);

    for (const line of normalizedLines) {
        if (typeof line !== STRING_TYPE) {
            retainedLines.push(line);
            continue;
        }

        const match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) {
            retainedLines.push(line);
            continue;
        }

        const [, prefix = "///", suffix = ""] = match;
        const trimmedSuffix = suffix.trim();

        if (trimmedSuffix.length === 0) {
            retainedLines.push(line);
            continue;
        }

        // If the line already contains a doc-tag (e.g. `@param`, `@returns`),
        // treat it as an explicit metadata tag and do not attempt to convert
        // a legacy "payload - description" style into a @returns tag. This
        // prevents lines such as `/// @param {real} r -  The radius` from
        // being misinterpreted as an implicit returns description.
        if (trimmedSuffix.startsWith("@")) {
            retainedLines.push(line);
            continue;
        }

        // Support two common legacy patterns:
        // 1) "payload - description" (hyphen style)
        // 2) "Returns: type, description" (colon-style)
        // Try to recognize the colon-style first to support existing tests
        // whose sources use the "Returns:" prefix for conversion.
        const returnsMatch = trimmedSuffix.match(
            LEGACY_RETURNS_DESCRIPTION_PATTERN
        );
        let payload: string;

        const returnsColonMatch = trimmedSuffix.match(/^returns\s*:\s*(.*)$/i);

        if (returnsColonMatch) {
            payload = (returnsColonMatch[1] ?? "").trim();
        } else if (returnsMatch) {
            payload = returnsMatch[0];
        } else {
            // console.log("Retaining line (no match):", line);
            retainedLines.push(line);
            continue;
        }

        const payloadParts = parseLegacyReturnPayload(payload);
        if (!payloadParts) {
            // console.log("Retaining line (no payload parts):", line);
            retainedLines.push(line);
            continue;
        }

        let { typeText, descriptionText } = payloadParts;

        if (opts.normalizeDocCommentTypeAnnotations && typeText) {
            typeText = opts.normalizeDocCommentTypeAnnotations(typeText);
        }

        if (typeText.length === 0 && descriptionText.length === 0) {
            // console.log("Retaining line (empty payload):", line);
            retainedLines.push(line);
            continue;
        }

        if (descriptionText.length > 0 && /^[a-z]/.test(descriptionText)) {
            descriptionText = capitalize(descriptionText);
        }

        let normalizedType = typeText.trim();
        if (normalizedType.length > 0 && !/^\{.*\}$/.test(normalizedType)) {
            normalizedType = `{${normalizedType}}`;
        }

        let converted = `${prefix} @returns`;
        if (normalizedType.length > 0) {
            converted += ` ${normalizedType}`;
        }
        if (descriptionText.length > 0) {
            converted += ` ${descriptionText}`;
        }

        convertedReturns.push(converted);
    }

    if (convertedReturns.length === 0) {
        if (preserveLeadingBlank) {
            (normalizedLines as any)._suppressLeadingBlank = true;
        }
        if (preserveDescriptionBreaks) {
            (normalizedLines as any)._preserveDescriptionBreaks = true;
        }
        return normalizedLines as DocCommentLines;
    }

    const resultLines = [...retainedLines];

    let appendIndex = resultLines.length;
    while (
        appendIndex > 0 &&
        typeof resultLines[appendIndex - 1] === STRING_TYPE &&
        resultLines[appendIndex - 1].trim() === ""
    ) {
        appendIndex -= 1;
    }

    resultLines.splice(appendIndex, 0, ...convertedReturns);

    if (preserveLeadingBlank) {
        (resultLines as any)._suppressLeadingBlank = true;
    }

    if (preserveDescriptionBreaks) {
        (resultLines as any)._preserveDescriptionBreaks = true;
    }

    return resultLines as DocCommentLines;
}

type LegacyReturnPayload = {
    // TODO: What is this used for? Is it needed? Document this if actually needed/used or else remove it.
    typeText: string;
    descriptionText: string;
};

/**
 * Parses legacy return payload strings into discrete type and description
 * segments so later logic can synthesize proper `@returns` metadata.
 */
function parseLegacyReturnPayload(payload: string): LegacyReturnPayload | null {
    const trimmedPayload = payload.trim();
    if (trimmedPayload.length === 0) {
        return null;
    }

    const typeAndDescriptionMatch = trimmedPayload.match(
        /^([^,–—-]+)[,–—-]\s*(.+)$/
    );

    if (typeAndDescriptionMatch) {
        return {
            typeText: typeAndDescriptionMatch[1].trim(),
            descriptionText: typeAndDescriptionMatch[2].trim()
        };
    }

    const spaceMatch = trimmedPayload.match(/^(\S+)\s+(.+)$/);
    if (spaceMatch && KNOWN_TYPES.has(spaceMatch[1].toLowerCase())) {
        return {
            typeText: spaceMatch[1],
            descriptionText: spaceMatch[2]
        };
    }

    if (/\s/.test(trimmedPayload)) {
        return {
            typeText: "",
            descriptionText: trimmedPayload
        };
    }

    return {
        typeText: trimmedPayload.replace(/[,.]+$/u, "").trim(),
        descriptionText: ""
    };
}

export function promoteLeadingDocCommentTextToDescription(
    docLines: DocCommentLines | string[],
    extraTaggedDocLines: DocCommentLines | string[] = []
) {
    const normalizedLines = Array.isArray(docLines) ? [...docLines] : [];

    if (normalizedLines.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const segments: { prefix: string; suffix: string }[] = [];
    let leadingCount = 0;

    while (leadingCount < normalizedLines.length) {
        const line = normalizedLines[leadingCount];
        if (typeof line !== STRING_TYPE) {
            break;
        }

        const trimmed = line.trim();
        const isDocLikeSummary =
            trimmed.startsWith("///") || /^\/\/\s*\//.test(trimmed);
        if (!isDocLikeSummary) {
            break;
        }

        const isTaggedLine =
            /^\/\/\/\s*@/i.test(trimmed) || /^\/\/\s*\/\s*@/i.test(trimmed);
        if (isTaggedLine) {
            break;
        }

        let match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) {
            const docLikeMatch = line.match(/^(\s*)\/\/\s*\/(.*)$/);
            if (!docLikeMatch) {
                break;
            }

            const [, indent = "", suffix = ""] = docLikeMatch;
            match = [line, `${indent}///`, suffix];
        }

        const [, prefix = "///", suffix = ""] = match;
        segments.push({ prefix, suffix });
        leadingCount += 1;
    }

    if (segments.length === 0) {
        return normalizedLines as DocCommentLines;
    }

    const firstContentIndex = segments.findIndex(({ suffix }) =>
        isNonEmptyTrimmedString(suffix)
    );

    if (firstContentIndex === -1) {
        return normalizedLines as DocCommentLines;
    }

    const remainder = normalizedLines.slice(leadingCount);
    const remainderContainsTag = remainder.some(isDocCommentTagLine);
    const extraContainsTag =
        Array.isArray(extraTaggedDocLines) &&
        extraTaggedDocLines.some(isDocCommentTagLine);

    if (!remainderContainsTag && !extraContainsTag) {
        return normalizedLines as DocCommentLines;
    }

    const promotedLines: string[] = [];
    const firstSegment = segments[firstContentIndex];
    const indent = firstSegment.prefix.slice(
        0,
        Math.max(firstSegment.prefix.length - 3, 0)
    );
    const normalizedBasePrefix = `${indent}///`;
    const descriptionLinePrefix = `${normalizedBasePrefix} @description `;
    const continuationPadding = Math.max(
        descriptionLinePrefix.length - (indent.length + 4),
        0
    );
    const continuationPrefix = `${indent}/// ${" ".repeat(continuationPadding)}`;

    for (const [index, { prefix, suffix }] of segments.entries()) {
        const trimmedSuffix = suffix.trim();
        const hasLeadingWhitespace = suffix.length === 0 || /^\s/.test(suffix);

        if (index < firstContentIndex) {
            const normalizedSuffix = hasLeadingWhitespace
                ? suffix
                : ` ${suffix}`;
            promotedLines.push(`${prefix}${normalizedSuffix}`);
            continue;
        }

        if (index === firstContentIndex) {
            promotedLines.push(
                trimmedSuffix.length > 0
                    ? `${prefix} @description ${trimmedSuffix}`
                    : `${prefix} @description`
            );
            continue;
        }

        if (trimmedSuffix.length === 0) {
            continue;
        }

        const continuationText = trimmedSuffix;
        const resolvedContinuation =
            continuationPrefix.length > 0
                ? `${continuationPrefix}${continuationText}`
                : `${prefix} ${continuationText}`;

        promotedLines.push(resolvedContinuation);
    }

    // we already computed remainder above
    const result: DocCommentLines = [
        ...promotedLines,
        ...remainder
    ] as DocCommentLines;

    const hasContinuationSegments = segments.some(
        ({ suffix }, index) =>
            index > firstContentIndex && isNonEmptyTrimmedString(suffix)
    );

    if (hasContinuationSegments) {
        (result as any)._preserveDescriptionBreaks = true;
    }

    if ((normalizedLines as any)._suppressLeadingBlank) {
        (result as any)._suppressLeadingBlank = true;
    }

    return result;
}

/**
 * Detect whether doc lines include legacy `returns - description` style entries
 * that should be converted to `@returns {Type} Description` metadata.
 */
export function hasLegacyReturnsDescriptionLines(
    docLines: DocCommentLines | string[]
) {
    const normalizedLines: string[] = Array.isArray(docLines)
        ? [...docLines]
        : [];
    if (normalizedLines.length === 0) {
        return false;
    }

    for (const line of normalizedLines) {
        if (typeof line !== STRING_TYPE) continue;
        const match = line.match(/^(\s*\/\/\/)(.*)$/);
        if (!match) continue;
        const suffix = (match[2] ?? "").trim();
        if (suffix.length === 0) continue;
        if (LEGACY_RETURNS_DESCRIPTION_PATTERN.test(suffix)) return true;
        if (/^returns\s*:/i.test(suffix)) return true;
    }

    return false;
}

const JSDOC_REPLACEMENTS = {
    "@func": "@function",
    "@method": "@function",
    "@yield": "@returns",
    "@yields": "@returns",
    "@return": "@returns",
    "@output": "@returns",
    "@outputs": "@returns",
    "@desc": "@description",
    "@arg": "@param",
    "@argument": "@param",
    "@params": "@param",
    "@overrides": "@override",
    "@overide": "@override",
    "@overridden": "@override",
    "@exception": "@throws",
    "@throw": "@throws",
    "@private": "@hide",
    "@hidden": "@hide"
};

const JSDOC_REPLACEMENT_RULES = Object.entries(JSDOC_REPLACEMENTS).map(
    ([oldWord, newWord]) => ({
        regex: new RegExp(String.raw`(\/\/\/\s*)${oldWord}\b`, "gi"),
        replacement: newWord
    })
);

const FUNCTION_LIKE_DOC_TAG_PATTERN = /@(func(?:tion)?|method)\b/i;

const FUNCTION_SIGNATURE_PATTERN =
    /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\n|$))/gi;

const DOC_COMMENT_TYPE_PATTERN = /\{([^}]+)\}/g;

export const DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION = Object.freeze({
    synonyms: Object.freeze([
        // TODO: Can this be changed into a Map/other for performance?
        ["void", "undefined"],
        ["undefined", "undefined"],
        ["real", "real"],
        ["bool", "bool"],
        ["boolean", "boolean"],
        ["string", "string"],
        ["array", "array"],
        ["struct", "struct"],
        ["enum", "enum"],
        ["pointer", "pointer"],
        ["method", "method"],
        ["asset", "asset"],
        ["constant", "constant"],
        ["any", "any"],
        ["var", "var"],
        ["int64", "int64"],
        ["int32", "int32"],
        ["int16", "int16"],
        ["int8", "int8"],
        ["uint64", "uint64"],
        ["uint32", "uint32"],
        ["uint16", "uint16"],
        ["uint8", "uint8"]
    ]),
    specifierPrefixes: Object.freeze([
        "asset",
        "constant",
        "enum",
        "id",
        "struct"
    ]),
    canonicalSpecifierNames: Object.freeze([
        ["asset", "Asset"],
        ["constant", "Constant"],
        ["enum", "Enum"],
        ["id", "Id"],
        ["struct", "Struct"]
    ])
});

const docCommentTypeNormalizationController = createResolverController({
    defaultFactory: () =>
        createDocCommentTypeNormalization(
            DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION
        ),
    reuseDefaultValue: true,
    invoke(resolver, options) {
        return resolver({
            defaults: DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION,
            options
        });
    },
    normalize(result) {
        return createDocCommentTypeNormalization(result);
    },
    errorMessage:
        "Doc comment type normalization resolvers must be functions that return a normalization descriptor"
});

function normalizeEntryPair(entry: unknown) {
    if (Array.isArray(entry)) {
        return entry.length >= 2 ? [entry[0], entry[1]] : null;
    }

    if (!entry || typeof entry !== "object") {
        return null;
    }

    if (Object.hasOwn(entry, 0) && Object.hasOwn(entry, 1)) {
        const arr = entry as any;
        return [arr[0], arr[1]];
    }

    if (Object.hasOwn(entry, "key") && Object.hasOwn(entry, "value")) {
        const obj = entry as Record<string, unknown>;
        return [obj.key, obj.value];
    }

    return null;
}

function normalizeDocCommentLookupKey(identifier: unknown) {
    const trimmed = getNonEmptyTrimmedString(identifier);
    if (!trimmed) {
        return null;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized.length === 0) {
        return null;
    }

    return normalized;
}

function createDocCommentTypeNormalization(candidate: unknown) {
    const synonyms = new Map<string, string>();
    for (const [
        key,
        value
    ] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.synonyms) {
        synonyms.set(key.toLowerCase(), value);
    }

    const canonicalSpecifierNames = new Map<string, string>();
    for (const [
        key,
        value
    ] of DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.canonicalSpecifierNames) {
        canonicalSpecifierNames.set(key.toLowerCase(), value);
    }

    const specifierPrefixes = new Set(
        DEFAULT_DOC_COMMENT_TYPE_NORMALIZATION.specifierPrefixes.map((value) =>
            value.toLowerCase()
        )
    );

    if (candidate && typeof candidate === "object") {
        const cand = candidate as Record<string, unknown>;
        mergeNormalizationEntries(synonyms, cand.synonyms);
        mergeNormalizationEntries(
            canonicalSpecifierNames,
            cand.canonicalSpecifierNames
        );
        mergeSpecifierPrefixes(specifierPrefixes, cand.specifierPrefixes);
    }

    return Object.freeze({
        lookupTypeIdentifier(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => synonyms.get(normalized) ?? null,
                null
            );
        },
        getCanonicalSpecifierName(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => canonicalSpecifierNames.get(normalized) ?? null,
                null
            );
        },
        hasSpecifierPrefix(identifier: unknown) {
            return withNormalizedDocCommentLookup(
                identifier,
                (normalized) => specifierPrefixes.has(normalized),
                false
            );
        }
    });
}

function withNormalizedDocCommentLookup(
    identifier: unknown,
    handler: (normalized: string) => unknown,
    fallbackValue: unknown
) {
    if (typeof handler !== "function") {
        throw new TypeError(
            "Doc comment lookup handler must be provided as a function."
        );
    }

    const normalized = normalizeDocCommentLookupKey(identifier);
    if (!normalized) {
        return fallbackValue;
    }

    return handler(normalized);
}

function mergeNormalizationEntries(
    target: Map<string, string>,
    entries: unknown
) {
    if (!entries) {
        return;
    }

    for (const [rawKey, rawValue] of getEntryIterable(entries) ?? []) {
        const key = normalizeDocCommentLookupKey(rawKey);
        const value = getNonEmptyTrimmedString(rawValue);
        if (!key || !value) {
            continue;
        }
        target.set(key, value);
    }
}

function mergeSpecifierPrefixes(target: Set<string>, candidates: unknown) {
    if (!candidates) {
        return;
    }

    for (const candidate of toIterable(candidates)) {
        const normalized = normalizeDocCommentLookupKey(candidate);
        if (!normalized) {
            continue;
        }
        target.add(normalized);
    }
}

function tryGetEntriesIterator(candidate: unknown) {
    if (
        !candidate ||
        Array.isArray(candidate) ||
        (typeof candidate !== "object" && typeof candidate !== "function")
    ) {
        return null;
    }

    const { entries } = candidate as { entries?: () => Iterator<unknown> };
    if (typeof entries !== "function") {
        return null;
    }

    try {
        const iterator = entries.call(candidate);
        if (iterator && typeof iterator[Symbol.iterator] === "function") {
            return iterator;
        }
    } catch {
        return null;
    }

    return null;
}

function* getEntryIterable(value: unknown) {
    if (!value) {
        return;
    }

    const entriesIterator = tryGetEntriesIterator(value);
    if (entriesIterator) {
        for (const entry of entriesIterator) {
            const pair = normalizeEntryPair(entry);
            if (pair) {
                yield pair;
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const pair = normalizeEntryPair(entry);
            if (pair) {
                yield pair;
            }
        }
        return;
    }

    if (typeof value === "object") {
        yield* Object.entries(value);
    }
}

function* toIterable(value: unknown) {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === "string") {
        yield value;
        return;
    }

    if (typeof value[Symbol.iterator] === "function") {
        yield* value as Iterable<unknown>;
        return;
    }

    if (typeof value === "object") {
        yield* Object.values(value as Record<string, unknown>);
    }
}

export function resolveDocCommentTypeNormalization(options: unknown = {}) {
    return docCommentTypeNormalizationController.resolve(options);
}

export function setDocCommentTypeNormalizationResolver(resolver: unknown) {
    return docCommentTypeNormalizationController.set(resolver);
}

export function restoreDefaultDocCommentTypeNormalizationResolver() {
    return docCommentTypeNormalizationController.restore();
}

export function applyJsDocReplacements(text: unknown) {
    const shouldStripEmptyParams =
        typeof text === "string" && FUNCTION_LIKE_DOC_TAG_PATTERN.test(text);

    let formattedText: unknown = text;

    if (typeof text === "string") {
        let stringText: string = shouldStripEmptyParams
            ? text.replace(/\(\)\s*$/, "")
            : text;

        for (const { regex, replacement } of JSDOC_REPLACEMENT_RULES) {
            regex.lastIndex = 0;
            stringText = stringText.replace(regex, `$1${replacement}`);
        }

        stringText = stripTrailingFunctionParameters(stringText);
        stringText = normalizeFeatherOptionalParamSyntax(stringText);

        formattedText = stringText;
    }

    if (typeof formattedText !== "string") {
        return formattedText;
    }

    return normalizeDocCommentTypeAnnotations(formattedText);
}

function normalizeFeatherOptionalParamSyntax(text: string) {
    if (typeof text !== "string" || !/@param\b/i.test(text)) {
        return text;
    }

    return text.replace(
        /(\s*\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)(\S+)/i,
        (match, prefix, token) =>
            `${prefix}${normalizeOptionalParamToken(token)}`
    );
}

function stripTrailingFunctionParameters(text: string) {
    if (typeof text !== "string" || !/@function\b/i.test(text)) {
        return text;
    }

    return text.replaceAll(
        FUNCTION_SIGNATURE_PATTERN,
        (match, linePrefix, functionPrefix) =>
            `${linePrefix}${functionPrefix.replace(/\s+$/, "")}`
    );
}

export function normalizeDocCommentTypeAnnotations(text: string) {
    if (typeof text !== "string" || !text.includes("{")) {
        return text;
    }

    DOC_COMMENT_TYPE_PATTERN.lastIndex = 0;
    return text.replace(DOC_COMMENT_TYPE_PATTERN, (match, typeText) => {
        const normalized = normalizeGameMakerType(typeText);
        return `{${normalized}}`;
    });
}

export function normalizeGameMakerType(typeText: string) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    const docCommentTypeNormalization = resolveDocCommentTypeNormalization();
    const segments: Array<{ type: "identifier" | "separator"; value: string }> =
        [];
    const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z_]+)/g;
    let match;

    while ((match = tokenPattern.exec(typeText)) !== null) {
        if (match[1]) {
            const identifier = match[1];
            const normalizedIdentifier =
                docCommentTypeNormalization.lookupTypeIdentifier(identifier) ??
                identifier;
            segments.push({
                type: "identifier",
                value: normalizedIdentifier
            });
            continue;
        }

        if (match[2]) {
            segments.push({ type: "separator", value: match[2] });
        }
    }

    const findNextNonWhitespaceSegment = (startIndex: number) => {
        for (let index = startIndex; index < segments.length; index += 1) {
            const segment = segments[index];
            if (
                segment &&
                segment.type === "separator" &&
                /^\s+$/.test(segment.value)
            ) {
                continue;
            }

            return segment ?? null;
        }

        return null;
    };

    const outputSegments: string[] = [];

    const isDotSeparatedTypeSpecifierPrefix = (prefixIndex: number) => {
        let sawDot = false;

        for (let index = prefixIndex + 1; index < segments.length; index += 1) {
            const candidate = segments[index];
            if (!candidate) {
                continue;
            }

            if (candidate.type === "separator") {
                const trimmed = getNonEmptyTrimmedString(candidate.value);

                if (!trimmed) {
                    continue;
                }

                if (trimmed.startsWith(".")) {
                    sawDot = true;
                    continue;
                }

                return false;
            }

            if (candidate.type === "identifier") {
                return sawDot;
            }

            return false;
        }

        return false;
    };

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
            continue;
        }

        if (segment.type === "identifier") {
            let normalizedValue: unknown = segment.value;

            if (typeof normalizedValue === "string") {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        normalizedValue
                    ) as string | null;

                if (
                    typeof canonicalPrefix === "string" &&
                    isDotSeparatedTypeSpecifierPrefix(index)
                ) {
                    normalizedValue = canonicalPrefix;
                }
            }

            outputSegments.push(normalizedValue as string);
            continue;
        }

        const separatorValue = segment.value ?? "";
        if (separatorValue.length === 0) {
            continue;
        }

        if (/^\s+$/.test(separatorValue)) {
            const previous = segments[index - 1];
            const next = segments[index + 1];
            const nextToken = findNextNonWhitespaceSegment(index + 1);

            if (
                nextToken &&
                nextToken.type === "separator" &&
                /^[\[\(<>{})]/.test(nextToken.value.trim())
            ) {
                continue;
            }

            const previousIdentifier =
                previous && previous.type === "identifier"
                    ? previous.value
                    : null;
            const nextIdentifier =
                next && next.type === "identifier" ? next.value : null;

            if (!previousIdentifier || !nextIdentifier) {
                continue;
            }

            if (
                docCommentTypeNormalization.hasSpecifierPrefix(
                    previousIdentifier
                )
            ) {
                const canonicalPrefix =
                    docCommentTypeNormalization.getCanonicalSpecifierName(
                        previousIdentifier
                    );
                if (canonicalPrefix && outputSegments.length > 0) {
                    outputSegments[outputSegments.length - 1] =
                        canonicalPrefix as string;
                }
                outputSegments.push(".");
            } else {
                outputSegments.push(",");
            }

            continue;
        }

        let normalizedSeparator = separatorValue.replaceAll(/\s+/g, "");
        if (normalizedSeparator.length === 0) {
            continue;
        }

        normalizedSeparator = normalizedSeparator.replaceAll("|", ",");
        outputSegments.push(normalizedSeparator);
    }

    return outputSegments.join("");
}

export const suppressedImplicitDocCanonicalByNode = new WeakMap<
    any,
    Set<string>
>();
export const preferredParamDocNamesByNode = new WeakMap<
    any,
    Map<number, string>
>();

export interface SyntheticDocGenerationOptions {
    originalText?: string | null;
    locStart?: ((node: any) => number) | null;
    locEnd?: ((node: any) => number) | null;
    optimizeLoopLengthHoisting?: boolean;
    [key: string]: any;
}

export function stripSyntheticParameterSentinels(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    let sanitized = name as string;
    sanitized = sanitized.replace(/^[_$]+/, "");
    sanitized = sanitized.replace(/[_$]+$/, "");

    return sanitized.length > 0 ? sanitized : name;
}

export function normalizeDocMetadataName(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    const optionalNormalized = normalizeOptionalParamToken(name);
    if (typeof optionalNormalized === STRING_TYPE) {
        if (/^\[[^\]]+\]$/.test(optionalNormalized)) {
            return optionalNormalized;
        }

        const sanitized = stripSyntheticParameterSentinels(optionalNormalized);
        return (sanitized as string).length > 0
            ? sanitized
            : optionalNormalized;
    }

    return name;
}

export function getCanonicalParamNameFromText(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    let trimmed = (name as string).trim();

    if (trimmed.startsWith("[")) {
        let depth = 0;
        let closingIndex = -1;

        let index = 0;
        for (const char of trimmed) {
            if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    closingIndex = index;
                    break;
                }
            }

            index += 1;
        }

        if (closingIndex > 0) {
            trimmed = trimmed.slice(1, closingIndex);
        }
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
        trimmed = trimmed.slice(0, equalsIndex);
    }

    const normalized = normalizeDocMetadataName(trimmed.trim());
    return normalized && (normalized as string).length > 0 ? normalized : null;
}

export function docParamNamesLooselyEqual(left: unknown, right: unknown) {
    if (typeof left !== STRING_TYPE || typeof right !== STRING_TYPE) {
        return false;
    }

    const toComparable = (value: unknown) => {
        const normalized = normalizeDocMetadataName(value);
        if (typeof normalized !== STRING_TYPE) {
            return null;
        }

        let trimmed = (normalized as string).trim();
        if (trimmed.length === 0) {
            return null;
        }

        if (
            trimmed.startsWith("[") &&
            trimmed.endsWith("]") &&
            trimmed.length > 2
        ) {
            trimmed = trimmed.slice(1, -1).trim();
        }

        return trimmed.toLowerCase();
    };

    const leftComp = toComparable(left);
    const rightComp = toComparable(right);

    return leftComp !== null && rightComp !== null && leftComp === rightComp;
}

export function isOptionalParamDocName(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return false;
    }
    const trimmed = (name as string).trim();
    return trimmed.startsWith("[") && trimmed.endsWith("]");
}

export function normalizeParamDocType(typeText: string) {
    return getNonEmptyTrimmedString(typeText);
}

export const preservedUndefinedDefaultParameters = new WeakSet<any>();
export const synthesizedUndefinedDefaultParameters = new WeakSet<any>();

function getNormalizedParameterName(paramNode: any) {
    if (!paramNode) {
        return null;
    }

    const rawName = getIdentifierText(paramNode);
    if (typeof rawName !== STRING_TYPE || rawName.length === 0) {
        return null;
    }

    const normalizedName = normalizeDocMetadataName(rawName);
    return getNonEmptyString(normalizedName);
}

export function getIdentifierFromParameterNode(param: any) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
    ) {
        return param.left;
    }

    return null;
}

export function getArgumentIndexFromIdentifier(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    const match = (name as string).match(/^argument([0-9]+)$/);
    if (match) {
        return Number.parseInt(match[1], 10);
    }
    return null;
}

function getArgumentIndexFromNode(node: any) {
    if (!node) {
        return null;
    }

    if (node.type === "Identifier") {
        return getArgumentIndexFromIdentifier(node.name);
    }

    if (
        node.type === "MemberExpression" &&
        node.object?.type === "Identifier" &&
        node.object.name === "argument" &&
        node.property?.type === "Literal" &&
        typeof node.property.value === NUMBER_TYPE
    ) {
        return node.property.value;
    }

    return null;
}

function getSourceTextForNode(
    node: any,
    options: SyntheticDocGenerationOptions
) {
    if (!node) {
        return null;
    }

    const { originalText, locStart, locEnd } = options;

    if (typeof originalText !== STRING_TYPE) {
        return null;
    }

    const startIndex =
        typeof locStart === "function"
            ? locStart(node)
            : getNodeStartIndex(node);
    const endIndex =
        typeof locEnd === "function" ? locEnd(node) : getNodeEndIndex(node);

    if (
        typeof startIndex !== NUMBER_TYPE ||
        typeof endIndex !== NUMBER_TYPE ||
        startIndex < 0 ||
        endIndex <= startIndex ||
        endIndex > originalText.length
    ) {
        return null;
    }

    return originalText.slice(startIndex, endIndex);
}

function shouldOmitUndefinedDefaultForFunctionNode(functionNode: any) {
    if (!functionNode || !functionNode.type) {
        return false;
    }

    if (
        functionNode.type === "ConstructorDeclaration" ||
        functionNode.type === "ConstructorParentClause"
    ) {
        return false;
    }

    return functionNode.type === "FunctionDeclaration";
}

export function getParameterDocInfo(
    paramNode: any,
    functionNode: any,
    options: SyntheticDocGenerationOptions
) {
    if (!paramNode) {
        return null;
    }

    if (paramNode.type === "Identifier") {
        const name = getNormalizedParameterName(paramNode);
        return name
            ? {
                  name,
                  optional: false,
                  optionalOverride: false,
                  explicitUndefinedDefault: false
              }
            : null;
    }

    if (paramNode.type === "DefaultParameter") {
        if (paramNode.right == null) {
            const name = getNormalizedParameterName(paramNode.left);
            return name
                ? {
                      name,
                      optional: false,
                      optionalOverride: false,
                      explicitUndefinedDefault: false
                  }
                : null;
        }

        const name = getNormalizedParameterName(paramNode.left);
        if (!name) {
            return null;
        }

        const defaultIsUndefined = isUndefinedSentinel(paramNode.right);
        const signatureOmitsUndefinedDefault =
            defaultIsUndefined &&
            shouldOmitUndefinedDefaultForFunctionNode(functionNode);
        const isConstructorLike =
            functionNode?.type === "ConstructorDeclaration" ||
            functionNode?.type === "ConstructorParentClause";

        const shouldIncludeDefaultText =
            !defaultIsUndefined ||
            (!signatureOmitsUndefinedDefault && !isConstructorLike);

        const defaultText = shouldIncludeDefaultText
            ? getSourceTextForNode(paramNode.right, options)
            : null;

        const docName = defaultText ? `${name}=${defaultText}` : name;

        const optionalOverride = paramNode?._featherOptionalParameter === true;
        const searchName = getNormalizedParameterName(
            paramNode.left ?? paramNode
        );
        const explicitUndefinedDefaultFromSource =
            defaultIsUndefined &&
            typeof searchName === STRING_TYPE &&
            searchName.length > 0 &&
            typeof options?.originalText === STRING_TYPE &&
            options.originalText.includes(`${searchName} = undefined`);

        const optional = defaultIsUndefined
            ? isConstructorLike
                ? true
                : optionalOverride
            : true;

        return {
            name: docName,
            optional,
            optionalOverride,
            explicitUndefinedDefault: explicitUndefinedDefaultFromSource
        };
    }

    if (paramNode.type === "MissingOptionalArgument") {
        return null;
    }

    const fallbackName = getNormalizedParameterName(paramNode);
    return fallbackName
        ? {
              name: fallbackName,
              optional: false,
              optionalOverride: false,
              explicitUndefinedDefault: false
          }
        : null;
}

export function gatherImplicitArgumentReferences(functionNode: any) {
    const referencedIndices = new Set<number>();
    const aliasByIndex = new Map<number, string>();
    const directReferenceIndices = new Set<number>();

    console.log("Gathering implicit args for", functionNode.id?.name);

    const visit = (node: any, parent: any) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (node === functionNode) {
            if (functionNode.body) {
                visit(functionNode.body, node);
            }
            return;
        }

        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element, parent);
            }
            return;
        }

        if (
            node !== functionNode &&
            (node.type === "FunctionDeclaration" ||
                node.type === "StructFunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ConstructorDeclaration")
        ) {
            return;
        }

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            console.log(
                "VariableDeclarator",
                node.id?.name,
                "init index:",
                aliasIndex
            );
            if (
                aliasIndex !== null &&
                node.id?.type === "Identifier" &&
                !aliasByIndex.has(aliasIndex)
            ) {
                const aliasName = normalizeDocMetadataName(node.id.name);
                if (isNonEmptyTrimmedString(aliasName)) {
                    aliasByIndex.set(aliasIndex, aliasName);
                    referencedIndices.add(aliasIndex);
                }
            }
        }

        const directIndex = getArgumentIndexFromNode(node);
        if (directIndex !== null) {
            console.log("Direct ref:", directIndex, "parent:", parent?.type);
            referencedIndices.add(directIndex);
            if (
                parent?.type === "VariableDeclarator" &&
                parent.init === node &&
                aliasByIndex.has(directIndex)
            ) {
                // Alias initializer
                console.log("Skipping alias init for", directIndex);
            } else {
                directReferenceIndices.add(directIndex);
                console.log("Adding direct ref for", directIndex);
            }
        }

        for (const key in node) {
            if (
                key === "parent" ||
                key === "enclosingNode" ||
                key === "precedingNode" ||
                key === "followingNode"
            )
                continue;
            const child = node[key];
            if (typeof child === "object" && child !== null) {
                visit(child, node);
            }
        }
    };

    visit(functionNode, null);

    return { referencedIndices, aliasByIndex, directReferenceIndices };
}

export function collectImplicitArgumentDocNames(
    functionNode: any,
    _options: SyntheticDocGenerationOptions
) {
    void _options;
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "StructFunctionDeclaration")
    ) {
        return [];
    }

    if (Array.isArray(functionNode._featherImplicitArgumentDocEntries)) {
        const entries = functionNode._featherImplicitArgumentDocEntries;
        const suppressedCanonicals =
            suppressedImplicitDocCanonicalByNode.get(functionNode);

        try {
            const referenceInfo =
                gatherImplicitArgumentReferences(functionNode);

            if (referenceInfo) {
                try {
                    const directSet = referenceInfo.directReferenceIndices;
                    if (directSet && directSet.size > 0) {
                        for (const entry of entries) {
                            if (
                                entry &&
                                entry.index != null &&
                                !entry.hasDirectReference &&
                                directSet.has(entry.index)
                            ) {
                                entry.hasDirectReference = true;
                            }
                        }
                    }

                    const needsCanonicalScan = entries.some(
                        (e: any) => e && !e.hasDirectReference
                    );
                    if (needsCanonicalScan) {
                        const canonicalToEntries = new Map();
                        for (const e of entries) {
                            if (!e) continue;
                            const key =
                                e.canonical || e.fallbackCanonical || e.name;
                            if (!canonicalToEntries.has(key))
                                canonicalToEntries.set(key, []);
                            canonicalToEntries.get(key).push(e);
                        }
                    }
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }

        return entries.filter((entry: any) => {
            if (!entry) return false;
            if (entry._suppressDocLine) return false;
            if (
                suppressedCanonicals &&
                entry.canonical &&
                suppressedCanonicals.has(entry.canonical)
            ) {
                return false;
            }
            return true;
        });
    }

    return [];
}

function hasReturnStatement(node: any): boolean {
    if (!node) {
        return false;
    }

    if (node.type === "ReturnStatement") {
        return true;
    }

    if (node.type === "BlockStatement" && Array.isArray(node.body)) {
        return node.body.some(hasReturnStatement);
    }

    if (node.type === "IfStatement") {
        return (
            hasReturnStatement(node.consequent) ||
            hasReturnStatement(node.alternate)
        );
    }

    if (
        node.type === "WhileStatement" ||
        node.type === "DoUntilStatement" ||
        node.type === "ForStatement" ||
        node.type === "RepeatStatement" ||
        node.type === "WithStatement"
    ) {
        return hasReturnStatement(node.body);
    }

    if (node.type === "SwitchStatement" && Array.isArray(node.cases)) {
        return node.cases.some(
            (c: any) =>
                Array.isArray(c.consequent) &&
                c.consequent.some(hasReturnStatement)
        );
    }

    if (node.type === "TryStatement") {
        return (
            hasReturnStatement(node.block) ||
            hasReturnStatement(node.handler) ||
            hasReturnStatement(node.finalizer)
        );
    }

    if (node.type === "CatchClause") {
        return hasReturnStatement(node.body);
    }

    if (node.type === "Finalizer") {
        return hasReturnStatement(node.body);
    }

    return false;
}

function maybeAppendReturnsDoc(
    lines: string[],
    functionNode: any,
    hasReturnsTag: boolean,
    overrides: any = {}
) {
    if (!Array.isArray(lines)) {
        return [];
    }

    if (overrides?.suppressReturns === true) {
        return lines;
    }

    if (
        hasReturnsTag ||
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "StructFunctionDeclaration") ||
        functionNode._suppressSyntheticReturnsDoc
    ) {
        return lines;
    }

    const body = functionNode.body;

    if (!body) {
        return lines;
    }

    const hasReturn = hasReturnStatement(body);
    if (!hasReturn) {
        lines.push("/// @returns {undefined}");
    }

    return lines;
}

export function computeSyntheticFunctionDocLines(
    node: any,
    existingDocLines: readonly string[],
    options: SyntheticDocGenerationOptions,
    overrides: any = {}
) {
    if (!node) {
        return [];
    }

    type DocMeta = { tag: string; name?: string | null; type?: string | null };
    const metadata = (
        Array.isArray(existingDocLines)
            ? existingDocLines.map(parseDocCommentMetadata).filter(Boolean)
            : []
    ) as DocMeta[];
    const orderedParamMetadata = metadata.filter(
        (meta) => meta.tag === "param"
    );

    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const hasOverrideTag = metadata.some((meta) => meta.tag === "override");
    const documentedParamNames = new Set();
    const paramMetadataByCanonical = new Map();
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? getNodeName(node);
    const existingFunctionMetadata = metadata.find(
        (meta) => meta.tag === "function"
    );
    const normalizedFunctionName =
        typeof functionName === STRING_TYPE &&
        isNonEmptyTrimmedString(functionName)
            ? normalizeDocMetadataName(functionName)
            : null;
    const normalizedExistingFunctionName =
        typeof existingFunctionMetadata?.name === STRING_TYPE &&
        isNonEmptyTrimmedString(existingFunctionMetadata.name)
            ? normalizeDocMetadataName(existingFunctionMetadata.name)
            : null;

    for (const meta of metadata) {
        if (meta.tag !== "param") {
            continue;
        }

        const rawName = typeof meta.name === STRING_TYPE ? meta.name : null;
        if (!rawName) {
            continue;
        }

        documentedParamNames.add(rawName);

        const canonical = getCanonicalParamNameFromText(rawName);
        if (canonical && !paramMetadataByCanonical.has(canonical)) {
            paramMetadataByCanonical.set(canonical, meta);
        }
    }

    const shouldInsertOverrideTag =
        overrides?.includeOverrideTag === true && !hasOverrideTag;

    const lines: string[] = [];

    if (shouldInsertOverrideTag) {
        lines.push("/// @override");
    }

    const shouldInsertFunctionTag =
        normalizedFunctionName &&
        (normalizedExistingFunctionName === null ||
            normalizedExistingFunctionName !== normalizedFunctionName);

    if (shouldInsertFunctionTag) {
        lines.push(`/// @function ${functionName}`);
    }

    try {
        const initialSuppressed = new Set<string>();
        if (Array.isArray(node?.params)) {
            for (const [paramIndex, param] of node.params.entries()) {
                const ordinalMetadata =
                    Number.isInteger(paramIndex) && paramIndex >= 0
                        ? (orderedParamMetadata[paramIndex] ?? null)
                        : null;
                const rawOrdinalName =
                    typeof ordinalMetadata?.name === STRING_TYPE &&
                    ordinalMetadata.name.length > 0
                        ? ordinalMetadata.name
                        : null;
                const canonicalOrdinal = rawOrdinalName
                    ? getCanonicalParamNameFromText(rawOrdinalName)
                    : null;

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramIdentifier = getIdentifierFromParameterNode(param);
                const paramIdentifierName =
                    typeof paramIdentifier?.name === STRING_TYPE
                        ? paramIdentifier.name
                        : null;
                const canonicalParamName = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;

                const isGenericArgumentName =
                    typeof paramIdentifierName === STRING_TYPE &&
                    getArgumentIndexFromIdentifier(paramIdentifierName) !==
                        null;

                const canonicalOrdinalMatchesParam =
                    Boolean(canonicalOrdinal) &&
                    Boolean(canonicalParamName) &&
                    (canonicalOrdinal === canonicalParamName ||
                        docParamNamesLooselyEqual(
                            canonicalOrdinal,
                            canonicalParamName
                        ));

                const shouldAdoptOrdinalName =
                    Boolean(rawOrdinalName) &&
                    (canonicalOrdinalMatchesParam || isGenericArgumentName);

                if (
                    !shouldAdoptOrdinalName &&
                    canonicalOrdinal &&
                    canonicalParamName &&
                    canonicalOrdinal !== canonicalParamName &&
                    !paramMetadataByCanonical.has(canonicalParamName)
                ) {
                    const canonicalOrdinalMatchesDeclaredParam = Array.isArray(
                        node?.params
                    )
                        ? node.params.some(
                              (candidate: any, candidateIndex: number) => {
                                  if (candidateIndex === paramIndex)
                                      return false;
                                  const candidateInfo = getParameterDocInfo(
                                      candidate,
                                      node,
                                      options
                                  );
                                  const candidateCanonical = candidateInfo?.name
                                      ? getCanonicalParamNameFromText(
                                            candidateInfo.name
                                        )
                                      : null;
                                  return (
                                      candidateCanonical === canonicalOrdinal
                                  );
                              }
                          )
                        : false;

                    if (!canonicalOrdinalMatchesDeclaredParam) {
                        initialSuppressed.add(canonicalOrdinal as string);
                    }
                }
            }
        }

        if (initialSuppressed.size > 0) {
            suppressedImplicitDocCanonicalByNode.set(node, initialSuppressed);
        }

        try {
            const refInfo = gatherImplicitArgumentReferences(node);
            if (
                refInfo &&
                refInfo.aliasByIndex &&
                refInfo.aliasByIndex.size > 0
            ) {
                for (const rawDocName of documentedParamNames) {
                    try {
                        const normalizedDocName =
                            typeof rawDocName === "string"
                                ? rawDocName.replaceAll(/^\[|\]$/g, "")
                                : rawDocName;
                        const maybeIndex =
                            getArgumentIndexFromIdentifier(normalizedDocName);
                        if (
                            maybeIndex !== null &&
                            refInfo.aliasByIndex.has(maybeIndex)
                        ) {
                            const fallbackCanonical =
                                getCanonicalParamNameFromText(
                                    `argument${maybeIndex}`
                                ) ?? `argument${maybeIndex}`;
                            initialSuppressed.add(fallbackCanonical as string);
                        }
                    } catch {
                        /* ignore per-doc errors */
                    }
                }

                try {
                    for (const [
                        ordIndex,
                        ordMeta
                    ] of orderedParamMetadata.entries()) {
                        if (!ordMeta || typeof ordMeta.name !== STRING_TYPE)
                            continue;
                        const canonicalOrdinal = getCanonicalParamNameFromText(
                            ordMeta.name
                        );
                        if (!canonicalOrdinal) continue;
                        const fallback =
                            getCanonicalParamNameFromText(
                                `argument${ordIndex}`
                            ) || `argument${ordIndex}`;
                        initialSuppressed.add(fallback as string);
                    }
                } catch {
                    /* ignore */
                }

                if (initialSuppressed.size > 0) {
                    suppressedImplicitDocCanonicalByNode.set(
                        node,
                        initialSuppressed
                    );
                }
            }
        } catch {
            /* ignore gather errors */
        }
    } catch {
        /* ignore pre-pass errors */
    }

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(
        node,
        options
    );

    try {
        const fallbacksToAdd = [];
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const { canonical, fallbackCanonical, index, hasDirectReference } =
                entry;
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                !documentedParamNames.has(fallbackCanonical)
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
        }
        if (fallbacksToAdd.length > 0) {
            implicitArgumentDocNames.push(...fallbacksToAdd);
        }
    } catch {
        /* best-effort */
    }

    const implicitDocEntryByIndex = new Map();

    for (const entry of implicitArgumentDocNames) {
        if (!entry) {
            continue;
        }

        const { index } = entry;
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (!implicitDocEntryByIndex.has(index)) {
            implicitDocEntryByIndex.set(index, entry);
        }
    }

    if (
        !Array.isArray(node.params) ||
        (Array.isArray(node.params) && node.params.length === 0)
    ) {
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const {
                name: docName,
                index,
                canonical,
                fallbackCanonical
            } = entry;

            if (documentedParamNames.has(docName)) {
                if (
                    canonical &&
                    fallbackCanonical &&
                    canonical !== fallbackCanonical &&
                    entry.hasDirectReference === true &&
                    Number.isInteger(index) &&
                    index >= 0 &&
                    !documentedParamNames.has(fallbackCanonical)
                ) {
                    documentedParamNames.add(fallbackCanonical);
                    lines.push(`/// @param ${fallbackCanonical}`);
                }
                continue;
            }

            documentedParamNames.add(docName);
            lines.push(`/// @param ${docName}`);

            const shouldAddFallbackInDocumentedBranch =
                Boolean(canonical && fallbackCanonical) &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                !documentedParamNames.has(fallbackCanonical);

            if (shouldAddFallbackInDocumentedBranch) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
        }

        try {
            for (const entry of implicitArgumentDocNames) {
                if (!entry) continue;
                const { index, canonical, fallbackCanonical } = entry;
                const suppressedCanonicals =
                    suppressedImplicitDocCanonicalByNode.get(node);

                if (
                    entry.hasDirectReference === true &&
                    Number.isInteger(index) &&
                    index >= 0 &&
                    fallbackCanonical &&
                    fallbackCanonical !== canonical &&
                    !documentedParamNames.has(fallbackCanonical) &&
                    (!suppressedCanonicals ||
                        !suppressedCanonicals.has(fallbackCanonical))
                ) {
                    documentedParamNames.add(fallbackCanonical);
                    lines.push(`/// @param ${fallbackCanonical}`);
                }
            }
        } catch {
            /* best-effort */
        }

        return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map(
            (line) => normalizeDocCommentTypeAnnotations(line)
        );
    }

    for (const [paramIndex, param] of node.params.entries()) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const ordinalMetadata =
            Number.isInteger(paramIndex) && paramIndex >= 0
                ? (orderedParamMetadata[paramIndex] ?? null)
                : null;
        const rawOrdinalName =
            typeof ordinalMetadata?.name === STRING_TYPE &&
            ordinalMetadata.name.length > 0
                ? ordinalMetadata.name
                : null;
        const canonicalOrdinal = rawOrdinalName
            ? getCanonicalParamNameFromText(rawOrdinalName)
            : null;
        const implicitDocEntry = implicitDocEntryByIndex.get(paramIndex);
        const paramIdentifier = getIdentifierFromParameterNode(param);
        const paramIdentifierName =
            typeof paramIdentifier?.name === STRING_TYPE
                ? paramIdentifier.name
                : null;
        const isGenericArgumentName =
            typeof paramIdentifierName === STRING_TYPE &&
            getArgumentIndexFromIdentifier(paramIdentifierName) !== null;
        const implicitName =
            implicitDocEntry &&
            typeof implicitDocEntry.name === STRING_TYPE &&
            implicitDocEntry.name &&
            implicitDocEntry.canonical !== implicitDocEntry.fallbackCanonical
                ? implicitDocEntry.name
                : null;
        const canonicalParamName =
            (implicitDocEntry?.canonical && implicitDocEntry.canonical) ||
            getCanonicalParamNameFromText(paramInfo.name);
        const existingMetadata =
            (canonicalParamName &&
                paramMetadataByCanonical.has(canonicalParamName) &&
                paramMetadataByCanonical.get(canonicalParamName)) ||
            null;
        const existingDocName = existingMetadata?.name;
        const hasCompleteOrdinalDocs =
            Array.isArray(node.params) &&
            orderedParamMetadata.length === node.params.length;
        const canonicalOrdinalMatchesParam =
            Boolean(canonicalOrdinal) &&
            Boolean(canonicalParamName) &&
            (canonicalOrdinal === canonicalParamName ||
                docParamNamesLooselyEqual(
                    canonicalOrdinal,
                    canonicalParamName
                ));

        const shouldAdoptOrdinalName =
            Boolean(rawOrdinalName) &&
            (canonicalOrdinalMatchesParam || isGenericArgumentName);

        if (
            hasCompleteOrdinalDocs &&
            node &&
            typeof paramIndex === NUMBER_TYPE &&
            shouldAdoptOrdinalName
        ) {
            const documentedParamCanonical =
                getCanonicalParamNameFromText(paramInfo.name) ?? null;
            if (
                documentedParamCanonical &&
                paramMetadataByCanonical.has(documentedParamCanonical)
            ) {
                // The parameter already appears in the documented metadata;
                // avoid overriding it with mismatched ordinal ordering.
            } else {
                let preferredDocs = preferredParamDocNamesByNode.get(node);
                if (!preferredDocs) {
                    preferredDocs = new Map();
                    preferredParamDocNamesByNode.set(node, preferredDocs);
                }
                if (!preferredDocs.has(paramIndex)) {
                    preferredDocs.set(paramIndex, rawOrdinalName);
                }
            }
        }
        if (
            !shouldAdoptOrdinalName &&
            canonicalOrdinal &&
            canonicalParamName &&
            canonicalOrdinal !== canonicalParamName &&
            node &&
            !paramMetadataByCanonical.has(canonicalParamName)
        ) {
            const canonicalOrdinalMatchesDeclaredParam = Array.isArray(
                node?.params
            )
                ? node.params.some((candidate: any, candidateIndex: number) => {
                      if (candidateIndex === paramIndex) {
                          return false;
                      }

                      const candidateInfo = getParameterDocInfo(
                          candidate,
                          node,
                          options
                      );
                      const candidateCanonical = candidateInfo?.name
                          ? getCanonicalParamNameFromText(candidateInfo.name)
                          : null;

                      return candidateCanonical === canonicalOrdinal;
                  })
                : false;

            if (!canonicalOrdinalMatchesDeclaredParam) {
                let suppressedCanonicals =
                    suppressedImplicitDocCanonicalByNode.get(node);
                if (!suppressedCanonicals) {
                    suppressedCanonicals = new Set();
                    suppressedImplicitDocCanonicalByNode.set(
                        node,
                        suppressedCanonicals
                    );
                }
                suppressedCanonicals.add(canonicalOrdinal as string);
            }
        }
        const ordinalDocName =
            hasCompleteOrdinalDocs &&
            (!existingDocName || existingDocName.length === 0) &&
            shouldAdoptOrdinalName
                ? rawOrdinalName
                : null;
        let effectiveImplicitName = implicitName;
        if (effectiveImplicitName && ordinalDocName) {
            const canonicalImplicit =
                getCanonicalParamNameFromText(effectiveImplicitName) ?? null;
            const fallbackCanonical =
                implicitDocEntry?.fallbackCanonical ??
                getCanonicalParamNameFromText(paramInfo.name);

            if (
                canonicalOrdinal &&
                canonicalOrdinal !== fallbackCanonical &&
                canonicalOrdinal !== canonicalImplicit
            ) {
                const ordinalLength = (canonicalOrdinal as string).length;
                const implicitLength =
                    (canonicalImplicit &&
                        (canonicalImplicit as string).length > 0) ||
                    isNonEmptyTrimmedString(effectiveImplicitName);

                if (
                    ordinalLength >
                    (implicitLength ? (canonicalImplicit as string).length : 0)
                ) {
                    // Simplified check
                    effectiveImplicitName = null;
                    if (implicitDocEntry) {
                        implicitDocEntry._suppressDocLine = true;
                        if (implicitDocEntry.canonical && node) {
                            let suppressedCanonicals =
                                suppressedImplicitDocCanonicalByNode.get(node);
                            if (!suppressedCanonicals) {
                                suppressedCanonicals = new Set();
                                suppressedImplicitDocCanonicalByNode.set(
                                    node,
                                    suppressedCanonicals
                                );
                            }
                            suppressedCanonicals.add(
                                implicitDocEntry.canonical
                            );
                        }
                        if (canonicalOrdinal) {
                            implicitDocEntry.canonical = canonicalOrdinal;
                        }
                        if (ordinalDocName) {
                            implicitDocEntry.name = ordinalDocName;
                            if (node) {
                                let preferredDocs =
                                    preferredParamDocNamesByNode.get(node);
                                if (!preferredDocs) {
                                    preferredDocs = new Map();
                                    preferredParamDocNamesByNode.set(
                                        node,
                                        preferredDocs
                                    );
                                }
                                preferredDocs.set(paramIndex, ordinalDocName);
                            }
                        }
                    }
                }
            }
        }

        const optionalOverrideFlag = paramInfo?.optionalOverride === true;
        const defaultIsUndefined =
            param?.type === "DefaultParameter" &&
            isUndefinedSentinel(param.right);
        const shouldOmitUndefinedDefault =
            defaultIsUndefined &&
            shouldOmitUndefinedDefaultForFunctionNode(node);
        const hasExistingMetadata = Boolean(existingMetadata);
        const hasOptionalDocName =
            param?.type === "DefaultParameter" &&
            isOptionalParamDocName(existingDocName);
        const baseDocName =
            (effectiveImplicitName &&
                effectiveImplicitName.length > 0 &&
                effectiveImplicitName) ||
            (ordinalDocName && ordinalDocName.length > 0 && ordinalDocName) ||
            paramInfo.name;
        const parameterSourceText = getSourceTextForNode(param, options);
        const defaultCameFromSource =
            defaultIsUndefined &&
            typeof parameterSourceText === STRING_TYPE &&
            parameterSourceText.includes("=");

        const explicitOptionalMarker =
            param?._featherOptionalParameter === true;

        let shouldMarkOptional =
            Boolean(paramInfo.optional) ||
            hasOptionalDocName ||
            (param?.type === "DefaultParameter" &&
                isUndefinedSentinel(param.right) &&
                (explicitOptionalMarker ||
                    node?.type === "ConstructorDeclaration"));
        const hasSiblingExplicitDefault = Array.isArray(node?.params)
            ? node.params.some((candidate: any, candidateIndex: number) => {
                  if (candidateIndex === paramIndex || !candidate) {
                      return false;
                  }

                  if (candidate.type !== "DefaultParameter") {
                      return false;
                  }

                  return (
                      candidate.right != null &&
                      !isUndefinedSentinel(candidate.right)
                  );
              })
            : false;
        const hasPriorExplicitDefault = Array.isArray(node?.params)
            ? node.params.slice(0, paramIndex).some((candidate: any) => {
                  if (!candidate || candidate.type !== "DefaultParameter") {
                      return false;
                  }

                  return (
                      candidate.right != null &&
                      !isUndefinedSentinel(candidate.right)
                  );
              })
            : false;
        const shouldApplyOptionalSuppression =
            hasExistingMetadata || !hasSiblingExplicitDefault;

        const materializedFromExplicitLeft =
            param?._featherMaterializedFromExplicitLeft === true;
        if (
            !shouldMarkOptional &&
            !hasExistingMetadata &&
            hasSiblingExplicitDefault &&
            hasPriorExplicitDefault &&
            !materializedFromExplicitLeft &&
            param?._featherMaterializedTrailingUndefined !== true
        ) {
            shouldMarkOptional = true;
        }
        if (shouldApplyOptionalSuppression) {
            if (
                shouldMarkOptional &&
                defaultIsUndefined &&
                shouldOmitUndefinedDefault &&
                paramInfo?.explicitUndefinedDefault === true &&
                !optionalOverrideFlag &&
                !hasOptionalDocName
            ) {
                shouldMarkOptional = false;
            }
            if (
                shouldMarkOptional &&
                shouldOmitUndefinedDefault &&
                paramInfo.optional &&
                defaultCameFromSource &&
                !hasOptionalDocName
            ) {
                shouldMarkOptional = false;
            }
        }
        if (
            shouldMarkOptional &&
            param?.type === "Identifier" &&
            !synthesizedUndefinedDefaultParameters.has(param)
        ) {
            synthesizedUndefinedDefaultParameters.add(param);
        }
        if (shouldMarkOptional && defaultIsUndefined) {
            preservedUndefinedDefaultParameters.add(param);
        }
        const docName = shouldMarkOptional ? `[${baseDocName}]` : baseDocName;

        const normalizedExistingType = normalizeParamDocType(
            existingMetadata?.type
        );
        const normalizedOrdinalType = normalizeParamDocType(
            ordinalMetadata?.type
        );
        const docType = normalizedExistingType ?? normalizedOrdinalType;

        if (documentedParamNames.has(docName)) {
            if (implicitDocEntry?.name) {
                documentedParamNames.add(implicitDocEntry.name);
            }
            continue;
        }
        documentedParamNames.add(docName);
        if (implicitDocEntry?.name) {
            documentedParamNames.add(implicitDocEntry.name);
        }

        const typePrefix = docType ? `{${docType}} ` : "";
        lines.push(`/// @param ${typePrefix}${docName}`);
    }

    for (const entry of implicitArgumentDocNames) {
        if (!entry || entry._suppressDocLine) {
            continue;
        }

        const { name: docName, index, canonical, fallbackCanonical } = entry;
        const isImplicitFallbackEntry = canonical === fallbackCanonical;
        let declaredParamIsGeneric = false;
        if (
            Array.isArray(node?.params) &&
            Number.isInteger(index) &&
            index >= 0
        ) {
            const decl = node.params[index];
            const declId = getIdentifierFromParameterNode(decl);
            if (declId && typeof declId.name === STRING_TYPE) {
                declaredParamIsGeneric =
                    getArgumentIndexFromIdentifier(declId.name) !== null;
            }
        }
        const isFallbackEntry = canonical === fallbackCanonical;
        if (
            isFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        if (documentedParamNames.has(docName)) {
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                !documentedParamNames.has(fallbackCanonical) &&
                !declaredParamIsGeneric &&
                Array.isArray(node?.params) &&
                Number.isInteger(index) &&
                index >= 0 &&
                index < node.params.length
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
            continue;
        }

        if (
            isImplicitFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);

        if (
            canonical &&
            fallbackCanonical &&
            canonical !== fallbackCanonical &&
            entry.hasDirectReference === true &&
            !documentedParamNames.has(fallbackCanonical) &&
            Number.isInteger(index) &&
            index >= 0 &&
            !declaredParamIsGeneric
        ) {
            documentedParamNames.add(fallbackCanonical);
            lines.push(`/// @param ${fallbackCanonical}`);
        }
    }

    return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map(
        (line) => normalizeDocCommentTypeAnnotations(line)
    );
}

/**
 * Merge synthetic doc comments with existing metadata while preserving order.
 */
export function mergeSyntheticDocComments(
    node: any,
    existingDocLines: DocCommentLines | string[],
    options: any,
    overrides: any = {}
): MutableDocCommentLines {
    let normalizedExistingLines: MutableDocCommentLines = toMutableArray(
        existingDocLines
    ) as MutableDocCommentLines;
    const originalExistingHasTags =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE ? parseDocCommentMetadata(line) : false
        );

    // Compute synthetic lines early so promotion can consider synthetic tags
    // such as `/// @function` when deciding whether the file-top doc-like
    // comment text should be promoted into `@description` metadata.
    const preserveDescriptionBreaks =
        normalizedExistingLines?._preserveDescriptionBreaks === true;

    normalizedExistingLines = toMutableArray(
        reorderDescriptionLinesAfterFunction(normalizedExistingLines)
    ) as MutableDocCommentLines;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }
    const dedupedResult = dedupeReturnDocLines(normalizedExistingLines);
    normalizedExistingLines = toMutableArray(
        dedupedResult.lines
    ) as MutableDocCommentLines;
    const removedExistingReturnDuplicates = dedupedResult.removed;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }

    // Normalize legacy `Returns:` description lines early so the synthetic
    // computation sees an existing `@returns` tag when conversion occurs.
    // This prevents synthetic `@returns` entries from being added and
    // avoids conversion regressions where a legacy description would be
    // overwritten or duplicated by a synthetic `@returns` later in the
    // merging process.
    normalizedExistingLines = toMutableArray(
        convertLegacyReturnsDescriptionLinesToMetadata(
            normalizedExistingLines,
            {
                normalizeDocCommentTypeAnnotations: normalizeGameMakerType
            }
        )
    ) as MutableDocCommentLines;

    const _computedSynthetic = computeSyntheticFunctionDocLines(
        node,
        normalizedExistingLines,
        options,
        overrides
    );

    // Only promote leading doc comment text to @description if the original
    // set contained tags (e.g., `@param`) or used an alternate doc-like
    // prefix that should normalize (e.g., `// /`). This prevents synthetic
    // tags from causing plain leading summaries (/// text) to become
    // promoted description metadata unexpectedly.
    const originalExistingHasDocLikePrefixes =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE ? /^\s*\/\/\s*\/\s*/.test(line) : false
        );

    if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
        normalizedExistingLines = toMutableArray(
            promoteLeadingDocCommentTextToDescription(
                normalizedExistingLines,
                _computedSynthetic
            )
        ) as MutableDocCommentLines;
    }

    const syntheticLines =
        reorderDescriptionLinesAfterFunction(_computedSynthetic);

    const implicitDocEntries =
        node?.type === "FunctionDeclaration" ||
        node?.type === "StructFunctionDeclaration"
            ? collectImplicitArgumentDocNames(node, options)
            : [];
    const declaredParamCount = Array.isArray(node?.params)
        ? node.params.length
        : 0;
    const hasImplicitDocEntries = implicitDocEntries.length > 0;
    const hasParamDocLines = normalizedExistingLines.some((line) => {
        if (typeof line !== STRING_TYPE) {
            return false;
        }

        return /^\/\/\/\s*@param\b/i.test(toTrimmedString(line));
    });
    const shouldForceParamPrune =
        hasParamDocLines && declaredParamCount === 0 && !hasImplicitDocEntries;

    if (syntheticLines.length === 0 && !shouldForceParamPrune) {
        return toMutableArray(
            convertLegacyReturnsDescriptionLinesToMetadata(
                normalizedExistingLines,
                {
                    normalizeDocCommentTypeAnnotations: normalizeGameMakerType
                }
            )
        ) as MutableDocCommentLines;
    }

    if (normalizedExistingLines.length === 0) {
        return toMutableArray(
            convertLegacyReturnsDescriptionLinesToMetadata(syntheticLines, {
                normalizeDocCommentTypeAnnotations: normalizeGameMakerType
            })
        ) as MutableDocCommentLines;
    }

    const docTagMatches = (line, pattern) => {
        const trimmed = toTrimmedString(line);
        if (trimmed.length === 0) {
            return false;
        }

        if (pattern.global || pattern.sticky) {
            pattern.lastIndex = 0;
        }

        return pattern.test(trimmed);
    };

    const isFunctionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@function\b/i);
    const isOverrideLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@override\b/i);
    const isParamLine = (line) => docTagMatches(line, /^\/\/\/\s*@param\b/i);

    const isDescriptionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@description\b/i);

    const functionLines = syntheticLines.filter(isFunctionLine);
    const syntheticFunctionMetadata = functionLines
        .map((line) => parseDocCommentMetadata(line))
        .find(
            (meta) =>
                meta?.tag === "function" && typeof meta.name === STRING_TYPE
        );
    const syntheticFunctionName =
        typeof syntheticFunctionMetadata?.name === STRING_TYPE
            ? syntheticFunctionMetadata.name.trim()
            : null;
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));
    const overrideLines = otherLines.filter(isOverrideLine);
    otherLines = otherLines.filter((line) => !isOverrideLine(line));
    let returnsLines;

    // Cache canonical names so we only parse each doc comment line at most once.
    const paramCanonicalNameCache = new Map();
    const getParamCanonicalName = (line, metadata?) => {
        if (typeof line !== STRING_TYPE) {
            return null;
        }

        if (paramCanonicalNameCache.has(line)) {
            return paramCanonicalNameCache.get(line);
        }

        const docMetadata =
            metadata === undefined ? parseDocCommentMetadata(line) : metadata;
        const canonical =
            docMetadata?.tag === "param"
                ? getCanonicalParamNameFromText(docMetadata.name)
                : null;

        paramCanonicalNameCache.set(line, canonical);
        return canonical;
    };

    let mergedLines = [...normalizedExistingLines];
    let removedAnyLine = removedExistingReturnDuplicates;

    if (functionLines.length > 0) {
        const existingFunctionIndices = mergedLines
            .map((line, index) => (isFunctionLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingFunctionIndices.length > 0) {
            const [firstIndex, ...duplicateIndices] = existingFunctionIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateIndices.length - 1; i >= 0; i--) {
                mergedLines.splice(duplicateIndices[i], 1);
            }

            mergedLines.splice(firstIndex, 1, ...functionLines);
            removedAnyLine = true;
        } else {
            const firstParamIndex = mergedLines.findIndex(isParamLine);

            // If the original doc lines did not contain any metadata tags,
            // prefer to append synthetic `@function` tags after the existing
            // summary lines rather than inserting them before param tags.
            const insertionIndex = originalExistingHasTags
                ? firstParamIndex === -1
                    ? mergedLines.length
                    : firstParamIndex
                : mergedLines.length;
            const precedingLine =
                insertionIndex > 0 ? mergedLines[insertionIndex - 1] : null;
            const trimmedPreceding = toTrimmedString(precedingLine);
            const isDocCommentLine =
                typeof trimmedPreceding === STRING_TYPE &&
                /^\/\/\//.test(trimmedPreceding);
            const isDocTagLine =
                isDocCommentLine && /^\/\/\/\s*@/i.test(trimmedPreceding);

            let precedingDocTag = null;
            if (isDocCommentLine && isDocTagLine) {
                const metadata = parseDocCommentMetadata(precedingLine);
                if (metadata && typeof metadata.tag === STRING_TYPE) {
                    precedingDocTag = metadata.tag.toLowerCase();
                }
            }

            const shouldSeparateDocTag = precedingDocTag === "deprecated";

            const needsSeparatorBeforeFunction =
                trimmedPreceding !== "" &&
                typeof precedingLine === STRING_TYPE &&
                !isFunctionLine(precedingLine) &&
                (!isDocCommentLine || !isDocTagLine || shouldSeparateDocTag);

            if (needsSeparatorBeforeFunction) {
                mergedLines = [
                    ...mergedLines.slice(0, insertionIndex),
                    "",
                    ...mergedLines.slice(insertionIndex)
                ];
            }

            const insertAt = needsSeparatorBeforeFunction
                ? insertionIndex + 1
                : insertionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertAt),
                ...functionLines,
                ...mergedLines.slice(insertAt)
            ];
            removedAnyLine = true;
        }
    }

    if (overrideLines.length > 0) {
        const existingOverrideIndices = mergedLines
            .map((line, index) => (isOverrideLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingOverrideIndices.length > 0) {
            const [firstOverrideIndex, ...duplicateOverrideIndices] =
                existingOverrideIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateOverrideIndices.length - 1; i >= 0; i -= 1) {
                mergedLines.splice(duplicateOverrideIndices[i], 1);
            }

            mergedLines.splice(firstOverrideIndex, 1, ...overrideLines);
            removedAnyLine = true;
        } else {
            const firstFunctionIndex = mergedLines.findIndex(isFunctionLine);
            const insertionIndex =
                firstFunctionIndex === -1 ? 0 : firstFunctionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertionIndex),
                ...overrideLines,
                ...mergedLines.slice(insertionIndex)
            ];
            removedAnyLine = true;
        }
    }

    const paramLineIndices = new Map();
    for (const [index, line] of mergedLines.entries()) {
        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramLineIndices.set(canonical, index);
        }
    }

    if (otherLines.length > 0) {
        const normalizedOtherLines = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            const canonical = getParamCanonicalName(line, metadata);

            if (
                canonical &&
                paramLineIndices.has(canonical) &&
                metadata?.name
            ) {
                const lineIndex = paramLineIndices.get(canonical);
                const existingLine = mergedLines[lineIndex];

                const updatedLine = updateParamLineWithDocName(
                    existingLine,
                    metadata.name
                );
                if (updatedLine !== existingLine) {
                    mergedLines[lineIndex] = updatedLine;
                    removedAnyLine = true;
                }
                continue;
            }

            normalizedOtherLines.push(line);
        }

        otherLines = normalizedOtherLines;
    }

    if (otherLines.length > 0) {
        const nonReturnLines = [];
        const extractedReturns = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            if (metadata?.tag === "returns") {
                extractedReturns.push(line);
                continue;
            }

            nonReturnLines.push(line);
        }

        if (extractedReturns.length > 0) {
            otherLines = nonReturnLines;
            returnsLines = extractedReturns;
        }
    }

    const syntheticParamNames = new Set(
        otherLines
            .map((line) => getParamCanonicalName(line))
            .filter(isNonEmptyString)
    );

    if (syntheticParamNames.size > 0) {
        const beforeLength = mergedLines.length;
        mergedLines = mergedLines.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            if (!canonical) {
                return false;
            }

            return !syntheticParamNames.has(canonical);
        });
        if (mergedLines.length !== beforeLength) {
            removedAnyLine = true;
        }
    }

    const lastFunctionIndex = findLastIndex(mergedLines, isFunctionLine);
    let insertionIndex = lastFunctionIndex === -1 ? 0 : lastFunctionIndex + 1;

    if (lastFunctionIndex === -1) {
        while (
            insertionIndex < mergedLines.length &&
            typeof mergedLines[insertionIndex] === STRING_TYPE &&
            mergedLines[insertionIndex].trim() === ""
        ) {
            insertionIndex += 1;
        }
    }

    while (
        insertionIndex < mergedLines.length &&
        typeof mergedLines[insertionIndex] === STRING_TYPE &&
        isParamLine(mergedLines[insertionIndex])
    ) {
        insertionIndex += 1;
    }

    let result: MutableDocCommentLines = [
        ...mergedLines.slice(0, insertionIndex),
        ...otherLines,
        ...mergedLines.slice(insertionIndex)
    ];

    if (Array.isArray(returnsLines) && returnsLines.length > 0) {
        const { lines: dedupedReturns } = dedupeReturnDocLines(returnsLines, {
            includeNonReturnLine: (line, trimmed) => trimmed.length > 0
        });

        if (dedupedReturns.length > 0) {
            const filteredResult = [];
            let removedExistingReturns = false;

            for (const line of result) {
                if (
                    typeof line === STRING_TYPE &&
                    /^\/\/\/\s*@returns\b/i.test(toTrimmedString(line))
                ) {
                    removedExistingReturns = true;
                    continue;
                }

                filteredResult.push(line);
            }

            let appendIndex = filteredResult.length;

            while (
                appendIndex > 0 &&
                typeof filteredResult[appendIndex - 1] === STRING_TYPE &&
                filteredResult[appendIndex - 1].trim() === ""
            ) {
                appendIndex -= 1;
            }

            result = [
                ...filteredResult.slice(0, appendIndex),
                ...dedupedReturns,
                ...filteredResult.slice(appendIndex)
            ];

            if (removedExistingReturns) {
                removedAnyLine = true;
            }
        }
    }

    const finalDedupedResult = dedupeReturnDocLines(result);
    result = toMutableArray(finalDedupedResult.lines) as MutableDocCommentLines;
    if (finalDedupedResult.removed) {
        removedAnyLine = true;
    }

    const functionIndex = result.findIndex(isFunctionLine);
    if (functionIndex > 0) {
        const [functionLine] = result.splice(functionIndex, 1);
        result.unshift(functionLine);
    }

    const paramDocsByCanonical = new Map();

    for (const line of result) {
        if (typeof line !== STRING_TYPE) {
            continue;
        }

        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramDocsByCanonical.set(canonical, line);
        }
    }

    // Ensure that when the original existing doc lines did NOT include
    // metadata tags, but we have inserted synthetic tags, we preserve a
    // blank separator between the original summary and the synthetic tags.
    try {
        const hasOriginalTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE ? parseDocCommentMetadata(l) : false
            );
        if (
            !hasOriginalTags &&
            Array.isArray(existingDocLines) &&
            existingDocLines.length > 0
        ) {
            const firstSyntheticIndex = result.findIndex(
                (ln) =>
                    isFunctionLine(ln) || isOverrideLine(ln) || isParamLine(ln)
            );
            if (firstSyntheticIndex > 0) {
                const preceding = result[firstSyntheticIndex - 1];
                if (
                    typeof preceding === STRING_TYPE &&
                    preceding.trim() !== "" &&
                    result[firstSyntheticIndex] &&
                    typeof result[firstSyntheticIndex] === STRING_TYPE &&
                    /^\/\/\//.test(result[firstSyntheticIndex].trim()) && // Insert a blank line if we don't already have one
                    result[firstSyntheticIndex - 1] !== ""
                ) {
                    result = [
                        ...result.slice(0, firstSyntheticIndex),
                        "",
                        ...result.slice(firstSyntheticIndex)
                    ];
                }
            }
        }
    } catch {
        // best-effort: don't throw if core utilities are unavailable
    }

    const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(node);

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        // Only delete suppressed fallback doc lines if they are not
        // explicitly referenced (direct references) in the function body.
        // This mirrors the logic in `collectImplicitArgumentDocNames` and
        // ensures that explicitly referenced `argumentN` lines are preserved
        // even when a canonical was marked suppressed due to an alias.
        for (const canonical of suppressedCanonicals) {
            const candidate = paramDocsByCanonical.get(canonical);
            if (!candidate) continue;

            // If there is an implicit doc entry with the same canonical that
            // indicates a direct reference, keep the doc line. Otherwise remove
            // the fallback biased doc line so the alias doc comment can win.
            const directReferenceExists = implicitDocEntries.some((entry) => {
                if (!entry) return false;
                const key =
                    entry.canonical || entry.fallbackCanonical || entry.name;
                if (!key) return false;
                return key === canonical && entry.hasDirectReference === true;
            });

            if (!directReferenceExists) {
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (implicitDocEntries.length > 0) {
        const canonicalNames = new Set();
        const fallbackCanonicalsToRemove = new Set();

        for (const entry of implicitDocEntries) {
            if (entry?.canonical) {
                canonicalNames.add(entry.canonical);
            }

            if (
                entry?.fallbackCanonical &&
                entry.fallbackCanonical !== entry.canonical &&
                entry.hasDirectReference !== true
            ) {
                fallbackCanonicalsToRemove.add(entry.fallbackCanonical);
            }
        }

        for (const fallbackCanonical of fallbackCanonicalsToRemove) {
            // When an implicit alias entry indicates a different canonical
            // name for the same index (e.g. alias `two` for `argument2`),
            // prefer the alias and remove any stale fallback `argumentN`
            // doc line. Previously we avoided deleting the fallback when a
            // canonical with the same name was present; that prevented
            // alias-driven suppression from removing an explicit
            // `argumentN` doc line. Always remove the fallback canonical
            // here when it's marked for removal so aliases win.
            paramDocsByCanonical.delete(fallbackCanonical);
        }
    }

    let orderedParamDocs = [];
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            const paramInfo = getParameterDocInfo(param, node, options);
            const canonical = paramInfo?.name
                ? getCanonicalParamNameFromText(paramInfo.name)
                : null;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (orderedParamDocs.length === 0) {
        for (const entry of implicitDocEntries) {
            const canonical = entry?.canonical;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    const shouldDropRemainingParamDocs =
        !hasImplicitDocEntries &&
        declaredParamCount === 0 &&
        paramDocsByCanonical.size > 0;

    if (!shouldDropRemainingParamDocs) {
        for (const doc of paramDocsByCanonical.values()) {
            orderedParamDocs.push(doc);
        }
    }

    if (orderedParamDocs.length > 0) {
        const docsByCanonical = new Map();
        for (const docLine of orderedParamDocs) {
            if (typeof docLine !== STRING_TYPE) {
                continue;
            }

            const canonical = getParamCanonicalName(docLine);
            if (canonical) {
                docsByCanonical.set(canonical, docLine);
            }
        }

        const preferredDocs = preferredParamDocNamesByNode.get(node);
        const implicitEntryByIndex = new Map();
        for (const entry of implicitDocEntries) {
            if (entry && Number.isInteger(entry.index)) {
                implicitEntryByIndex.set(entry.index, entry);
            }
        }
        const reordered = [];

        if (Array.isArray(node.params)) {
            for (const [index, param] of node.params.entries()) {
                const implicitEntry = implicitEntryByIndex.get(index);
                if (implicitEntry) {
                    const implicitCanonical =
                        implicitEntry.canonical ||
                        getCanonicalParamNameFromText(implicitEntry.name);
                    if (
                        implicitCanonical &&
                        docsByCanonical.has(implicitCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(implicitCanonical));
                        docsByCanonical.delete(implicitCanonical);
                        continue;
                    }
                }

                const preferredName = preferredDocs?.get(index);
                if (preferredName) {
                    const preferredCanonical =
                        getCanonicalParamNameFromText(preferredName);
                    if (
                        preferredCanonical &&
                        docsByCanonical.has(preferredCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(preferredCanonical));
                        docsByCanonical.delete(preferredCanonical);
                        continue;
                    }
                }

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramCanonical = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;
                if (paramCanonical && docsByCanonical.has(paramCanonical)) {
                    reordered.push(docsByCanonical.get(paramCanonical));
                    docsByCanonical.delete(paramCanonical);
                }
            }
        }

        for (const docLine of docsByCanonical.values()) {
            reordered.push(docLine);
        }

        orderedParamDocs = reordered;
    }

    const finalDocs: MutableDocCommentLines = [];
    let insertedParams = false;

    for (const line of result) {
        if (isParamLine(line)) {
            if (!insertedParams && orderedParamDocs.length > 0) {
                finalDocs.push(...orderedParamDocs);
                insertedParams = true;
            }
            continue;
        }

        finalDocs.push(line);
    }

    if (!insertedParams && orderedParamDocs.length > 0) {
        finalDocs.push(...orderedParamDocs);
    }

    let reorderedDocs: MutableDocCommentLines = finalDocs;

    const descriptionStartIndex = reorderedDocs.findIndex(isDescriptionLine);
    if (descriptionStartIndex !== -1) {
        let descriptionEndIndex = descriptionStartIndex + 1;

        while (
            descriptionEndIndex < reorderedDocs.length &&
            typeof reorderedDocs[descriptionEndIndex] === STRING_TYPE &&
            reorderedDocs[descriptionEndIndex].startsWith("///") &&
            !parseDocCommentMetadata(reorderedDocs[descriptionEndIndex])
        ) {
            descriptionEndIndex += 1;
        }

        const descriptionBlock = reorderedDocs.slice(
            descriptionStartIndex,
            descriptionEndIndex
        );
        const docsWithoutDescription = [
            ...reorderedDocs.slice(0, descriptionStartIndex),
            ...reorderedDocs.slice(descriptionEndIndex)
        ];

        let shouldOmitDescriptionBlock = false;
        if (descriptionBlock.length === 1) {
            const descriptionMetadata = parseDocCommentMetadata(
                descriptionBlock[0]
            );
            const descriptionText =
                typeof descriptionMetadata?.name === STRING_TYPE
                    ? descriptionMetadata.name.trim()
                    : "";

            // Omit empty description blocks
            if (descriptionText.length === 0) {
                shouldOmitDescriptionBlock = true;
            } else if (
                syntheticFunctionName &&
                descriptionText.startsWith(syntheticFunctionName)
            ) {
                // Omit alias-style descriptions like "functionName()"
                const remainder = descriptionText.slice(
                    syntheticFunctionName.length
                );
                const trimmedRemainder = remainder.trim();
                if (
                    trimmedRemainder.startsWith("(") &&
                    trimmedRemainder.endsWith(")")
                ) {
                    shouldOmitDescriptionBlock = true;
                }
            }
        }

        if (shouldOmitDescriptionBlock) {
            reorderedDocs = docsWithoutDescription;
        } else {
            let lastParamIndex = -1;
            for (const [index, element] of docsWithoutDescription.entries()) {
                if (isParamLine(element)) {
                    lastParamIndex = index;
                }
            }

            const insertionAfterParams =
                lastParamIndex === -1
                    ? docsWithoutDescription.length
                    : lastParamIndex + 1;

            reorderedDocs = [
                ...docsWithoutDescription.slice(0, insertionAfterParams),
                ...descriptionBlock,
                ...docsWithoutDescription.slice(insertionAfterParams)
            ];
        }
    }

    reorderedDocs = toMutableArray(
        reorderDescriptionLinesAfterFunction(reorderedDocs)
    ) as MutableDocCommentLines;

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        reorderedDocs = reorderedDocs.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            return !canonical || !suppressedCanonicals.has(canonical);
        });
    }

    reorderedDocs = reorderedDocs.map((line) => {
        if (!isParamLine(line)) {
            return line;
        }

        const match = line.match(
            /^(\/\/\/\s*@param\s*)(\{[^}]*\}\s*)?(\s*\S+)(.*)$/i
        );
        if (!match) {
            return normalizeDocCommentTypeAnnotations(line);
        }

        const [, prefix, rawTypeSection = "", rawName = "", remainder = ""] =
            match;
        const normalizedPrefix = `${prefix.replace(/\s*$/, "")} `;
        let normalizedTypeSection = rawTypeSection.trim();
        if (
            normalizedTypeSection.startsWith("{") &&
            normalizedTypeSection.endsWith("}")
        ) {
            const innerType = normalizedTypeSection.slice(1, -1);
            const normalizedInner = innerType.replaceAll("|", ",");
            normalizedTypeSection = `{${normalizedInner}}`;
        }
        const typePart =
            normalizedTypeSection.length > 0 ? `${normalizedTypeSection} ` : "";
        let normalizedName = rawName.trim();
        let remainingRemainder = remainder;

        if (
            normalizedName.startsWith("[") &&
            !normalizedName.endsWith("]") &&
            typeof remainingRemainder === STRING_TYPE &&
            remainingRemainder.length > 0
        ) {
            let bracketBalance = 0;

            for (const char of normalizedName) {
                if (char === "[") {
                    bracketBalance += 1;
                } else if (char === "]") {
                    bracketBalance -= 1;
                }
            }

            if (bracketBalance > 0) {
                let sliceIndex = 0;

                while (
                    sliceIndex < remainingRemainder.length &&
                    bracketBalance > 0
                ) {
                    const char = remainingRemainder[sliceIndex];
                    if (char === "[") {
                        bracketBalance += 1;
                    } else if (char === "]") {
                        bracketBalance -= 1;
                    }
                    sliceIndex += 1;
                }

                if (bracketBalance <= 0) {
                    const continuation = remainingRemainder.slice(
                        0,
                        sliceIndex
                    );
                    normalizedName = `${normalizedName}${continuation}`.trim();
                    remainingRemainder = remainingRemainder.slice(sliceIndex);
                }
            }
        }

        const remainderText = remainingRemainder.trim();
        const hasDescription = remainderText.length > 0;
        let descriptionPart = "";

        if (hasDescription) {
            const hyphenMatch = remainingRemainder.match(/^(\s*-\s*)(.*)$/);
            let normalizedDescription;
            let hyphenSpacing = " - ";

            if (hyphenMatch) {
                const [, rawHyphenSpacing = "", rawDescription = ""] =
                    hyphenMatch;
                normalizedDescription = rawDescription.trim();

                const trailingSpaceMatch = rawHyphenSpacing.match(/-(\s*)$/);
                if (trailingSpaceMatch) {
                    const originalSpaceCount = trailingSpaceMatch[1].length;
                    const preservedSpaceCount = Math.max(
                        1,
                        Math.min(originalSpaceCount, 2)
                    );
                    hyphenSpacing = ` - ${" ".repeat(preservedSpaceCount - 1)}`;
                }
            } else {
                normalizedDescription = remainderText.replace(/^[-\s]+/, "");
            }

            if (normalizedDescription.length > 0) {
                descriptionPart = `${hyphenSpacing}${normalizedDescription}`;
            }
        }

        const updatedLine = `${normalizedPrefix}${typePart}${normalizedName}${descriptionPart}`;
        return normalizeDocCommentTypeAnnotations(updatedLine);
    });

    if (preserveDescriptionBreaks) {
        result = reorderedDocs;
    } else {
        const wrappedDocs = [];
        const normalizedPrintWidth = coercePositiveIntegerOption(
            options?.printWidth,
            120
        );
        const wrapWidth = Math.min(
            normalizedPrintWidth,
            resolveDocCommentWrapWidth(options)
        );

        const wrapSegments = (text, firstAvailable, continuationAvailable) => {
            if (firstAvailable <= 0) {
                return [text];
            }

            const words = text.split(/\s+/).filter((word) => word.length > 0);
            if (words.length === 0) {
                return [];
            }

            const segments = [];
            let current = words[0];
            let currentAvailable = firstAvailable;

            for (let index = 1; index < words.length; index += 1) {
                const word = words[index];

                const endsSentence = /[.!?]["')\]]?$/.test(current);
                const startsSentence = /^[A-Z]/.test(word);
                if (
                    endsSentence &&
                    startsSentence &&
                    currentAvailable >= 60 &&
                    current.length >=
                        Math.max(Math.floor(currentAvailable * 0.6), 24)
                ) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                    continue;
                }

                if (current.length + 1 + word.length > currentAvailable) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                } else {
                    current += ` ${word}`;
                }
            }

            segments.push(current);

            const lastIndex = segments.length - 1;
            if (lastIndex >= 2) {
                // `Array#at` handles negative indices but introduces an extra bounds
                // check on every call. This helper runs for every doc comment we
                // wrap, so prefer direct index math to keep the hot path lean.
                const lastSegment = segments[lastIndex];
                const isSingleWord =
                    typeof lastSegment === STRING_TYPE &&
                    !/\s/.test(lastSegment);

                if (isSingleWord) {
                    const maxSingleWordLength = Math.max(
                        Math.min(continuationAvailable / 2, 16),
                        8
                    );

                    if (lastSegment.length <= maxSingleWordLength) {
                        const penultimateIndex = lastIndex - 1;
                        const mergedSegment = `${segments[penultimateIndex]} ${lastSegment}`;

                        segments[penultimateIndex] = mergedSegment;
                        segments.pop();
                    }
                }
            }

            return segments;
        };

        for (let index = 0; index < reorderedDocs.length; index += 1) {
            const line = reorderedDocs[index];
            if (isDescriptionLine(line)) {
                const blockLines = [line];
                let lookahead = index + 1;

                while (lookahead < reorderedDocs.length) {
                    const nextLine = reorderedDocs[lookahead];
                    if (
                        typeof nextLine === STRING_TYPE &&
                        nextLine.startsWith("///") &&
                        !parseDocCommentMetadata(nextLine)
                    ) {
                        blockLines.push(nextLine);
                        lookahead += 1;
                        continue;
                    }
                    break;
                }

                index = lookahead - 1;

                const prefixMatch = line.match(/^(\/\/\/\s*@description\s+)/i);
                if (!prefixMatch) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                const prefix = prefixMatch[1];
                const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;
                const descriptionText = blockLines
                    .map((docLine, blockIndex) => {
                        if (blockIndex === 0) {
                            return docLine.slice(prefix.length).trim();
                        }

                        if (docLine.startsWith(continuationPrefix)) {
                            return docLine
                                .slice(continuationPrefix.length)
                                .trim();
                        }

                        if (docLine.startsWith("///")) {
                            return docLine.slice(3).trim();
                        }

                        return docLine.trim();
                    })
                    .filter((segment) => segment.length > 0)
                    .join(" ");

                if (descriptionText.length === 0) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                const available = Math.max(wrapWidth - prefix.length, 16);
                const continuationAvailable = Math.max(
                    Math.min(available, 62),
                    16
                );
                const segments = wrapSegments(
                    descriptionText,
                    available,
                    continuationAvailable
                );

                if (segments.length === 0) {
                    wrappedDocs.push(...blockLines);
                    continue;
                }

                if (blockLines.length > 1) {
                    if (segments.length > blockLines.length) {
                        const paddedBlockLines = blockLines.map(
                            (docLine, blockIndex) => {
                                if (
                                    blockIndex === 0 ||
                                    typeof docLine !== STRING_TYPE
                                ) {
                                    return docLine;
                                }

                                if (
                                    !docLine.startsWith("///") ||
                                    parseDocCommentMetadata(docLine)
                                ) {
                                    return docLine;
                                }

                                if (docLine.startsWith(continuationPrefix)) {
                                    return docLine;
                                }

                                const trimmedContinuation = docLine
                                    .slice(3)
                                    .replace(/^\s+/, "");

                                if (trimmedContinuation.length === 0) {
                                    return docLine;
                                }

                                return `${continuationPrefix}${trimmedContinuation}`;
                            }
                        );

                        wrappedDocs.push(...paddedBlockLines);
                        continue;
                    }

                    // If the description is already expressed as multiple
                    // block lines and the wrapping computation compresses it
                    // into fewer segments (or same number), preserve the
                    // original blockLines rather than collapsing them into a
                    // single description line. Tests expect explicit
                    // continuations to remain visible rather than being
                    // merged into the first line.
                    if (segments.length <= blockLines.length) {
                        wrappedDocs.push(...blockLines);
                        continue;
                    }
                }

                wrappedDocs.push(`${prefix}${segments[0]}`);
                for (
                    let segmentIndex = 1;
                    segmentIndex < segments.length;
                    segmentIndex += 1
                ) {
                    wrappedDocs.push(
                        `${continuationPrefix}${segments[segmentIndex]}`
                    );
                }
                continue;
            }

            wrappedDocs.push(line);
        }

        reorderedDocs = wrappedDocs;

        result = reorderedDocs;
    }

    if (removedAnyLine || otherLines.length > 0) {
        result._suppressLeadingBlank = true;
    }

    let filteredResult: MutableDocCommentLines = toMutableArray(
        result.filter((line) => {
            if (typeof line !== STRING_TYPE) {
                return true;
            }

            if (!/^\/\/\/\s*@description\b/i.test(line.trim())) {
                return true;
            }

            const metadata = parseDocCommentMetadata(line);
            const descriptionText = toTrimmedString(metadata?.name);

            return descriptionText.length > 0;
        })
    );

    if (result._suppressLeadingBlank) {
        filteredResult._suppressLeadingBlank = true;
    }

    // If synthetic tags were computed and merged above, re-run promotion to
    // convert leading doc-like summary lines into a `@description` tag when a
    // doc tag now follows the summary. This can happen when the tag is
    // synthetic (inserted by computeSyntheticFunctionDocLines) and not present
    // in the original `existingDocLines` — re-running promotion here ensures
    // the presence of synthetic tags enables the promotion and avoids leaving
    // the summary as a plain inline/trailing comment.
    try {
        // Only re-run promotion if the original existing doc lines contained
        // metadata tags or were doc-like (`// /` style). Avoid promoting plain
        // triple slash summaries that had no metadata in the original source
        // so synthetic tags do not cause unwanted `@description` promotions.
        const originalExistingHasTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((line) =>
                typeof line === STRING_TYPE
                    ? parseDocCommentMetadata(line)
                    : false
            );
        const originalExistingHasDocLikePrefixes =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((line) =>
                typeof line === STRING_TYPE
                    ? /^\s*\/\/\s*\/\s*/.test(line)
                    : false
            );

        if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
            filteredResult = toMutableArray(
                promoteLeadingDocCommentTextToDescription(filteredResult)
            );
        }
    } catch {
        // If the Core service is unavailable (testing contexts), fall back to
        // the original behavior without promotion so we don't throw.
    }

    // If the original existing doc lines contained plain triple-slash
    // summary lines but no explicit doc tags, prefer to keep the summary
    // as plain text rather than a promoted `@description` tag and ensure a
    // blank line separates the summary from the synthetic metadata.
    try {
        const originalHasPlainSummary =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE
                    ? /^\/\/\/\s*(?!@).+/.test(l.trim())
                    : false
            );
        const originalHasTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE ? parseDocCommentMetadata(l) : false
            );
        if (originalHasPlainSummary && !originalHasTags) {
            const summaryLines = [] as string[];
            const otherLines = [] as string[];

            for (const ln of filteredResult) {
                if (typeof ln !== STRING_TYPE) continue;
                if (/^\/\/\/\s*@description\b/i.test(ln.trim())) {
                    const meta = parseDocCommentMetadata(ln);
                    const descriptionText =
                        typeof meta?.name === STRING_TYPE ? meta.name : "";
                    summaryLines.push(`/// ${descriptionText}`);
                    continue;
                }
                if (/^\/\/\/\s*@/i.test(ln.trim())) {
                    otherLines.push(ln);
                    continue;
                }
                // Treat other triple slash lines as summary continuations
                if (/^\/\/\/\s*/.test(ln.trim())) {
                    summaryLines.push(ln);
                    continue;
                }
                otherLines.push(ln);
            }

            if (summaryLines.length > 0 && otherLines.length > 0) {
                // Ensure a blank separator between summary block and synthetic metadata
                const combined = [...summaryLines, "", ...otherLines];
                filteredResult = toMutableArray(
                    combined as any
                ) as MutableDocCommentLines;
            }
        }
    } catch {
        // Best-effort fallback; do not throw on diagnostic operations
    }
    return toMutableArray(
        convertLegacyReturnsDescriptionLinesToMetadata(filteredResult, {
            normalizeDocCommentTypeAnnotations: normalizeGameMakerType
        })
    ) as MutableDocCommentLines;
}

/**
 * Determines whether synthetic doc comments should be emitted for the given function.
 */
export function shouldGenerateSyntheticDocForFunction(
    path: any,
    existingDocLines: DocCommentLines | string[],
    options: any
): boolean {
    const node = path.getValue();
    const parent = path.getParentNode();
    if (
        !node ||
        !parent ||
        (parent.type !== "Program" && parent.type !== "BlockStatement")
    ) {
        return false;
    }

    if (node.type === "ConstructorDeclaration") {
        return true;
    }

    if (
        node.type !== "FunctionDeclaration" &&
        node.type !== "StructFunctionDeclaration"
    ) {
        return false;
    }

    const convertedExistingForSynthetic =
        convertLegacyReturnsDescriptionLinesToMetadata(existingDocLines, {
            normalizeDocCommentTypeAnnotations: normalizeGameMakerType
        });
    const syntheticLines = computeSyntheticFunctionDocLines(
        node,
        convertedExistingForSynthetic,
        options
    );

    if (syntheticLines.length > 0) {
        return true;
    }

    if (hasLegacyReturnsDescriptionLines(existingDocLines)) {
        return true;
    }

    const hasParamDocLines = existingDocLines.some((line) => {
        if (typeof line !== STRING_TYPE) {
            return false;
        }

        const trimmed = toTrimmedString(line);
        return /^\/\/\/\s*@param\b/i.test(trimmed);
    });

    if (hasParamDocLines) {
        const declaredParamCount = Array.isArray(node.params)
            ? node.params.length
            : 0;
        let hasImplicitDocEntries = false;

        if (
            node.type === "FunctionDeclaration" ||
            node.type === "StructFunctionDeclaration"
        ) {
            const implicitEntries = collectImplicitArgumentDocNames(
                node,
                options
            );
            hasImplicitDocEntries = implicitEntries.length > 0;
        }

        if (declaredParamCount === 0 && !hasImplicitDocEntries) {
            return true;
        }
    }

    return (
        Array.isArray(node.params) &&
        node.params.some((param) => {
            return param?.type === "DefaultParameter";
        })
    );
}

function updateParamLineWithDocName(line: string, newDocName: string): string {
    if (typeof line !== STRING_TYPE || typeof newDocName !== STRING_TYPE) {
        return line;
    }

    const prefixMatch = line.match(/^(\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)/i);
    if (!prefixMatch) {
        return `/// @param ${newDocName}`;
    }

    const prefix = prefixMatch[0];
    const remainder = line.slice(prefix.length);
    if (remainder.length === 0) {
        return `${prefix}${newDocName}`;
    }

    const updatedRemainder = remainder.replace(/^[^\s]+/, newDocName);
    return `${prefix}${updatedRemainder}`;
}

export type { DocCommentPrinterDependencies } from "./doc-comment-printer-dependencies.js";
