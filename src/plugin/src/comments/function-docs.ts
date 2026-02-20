import { Core, DescriptionUtils, type MutableDocCommentLines, NormalizationUtils } from "@gml-modules/core";

import { safeGetParentNode } from "../printer/path-utils.js";
import { formatDocLikeLineComment, removeFunctionDocCommentLines, resolveDocCommentPrinterOptions } from "./index.js";

const STRING_TYPE = "string";
const BLANK_LINE_PATTERN = /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
const LINE_DOC_CONT_PATTERN = /^\/\/\s*\/(\s|$)/;
const LINE_DOC_AT_PATTERN = /^\/\/\s*@/;
const PARAM_PATTERN = /^([a-zA-Z0-9_]+(?:[ \t]*,[ \t]*[a-zA-Z0-9_]+)*)[ \t]*:[ \t]*(.*)$/;
const PARAM_DOC_LINE_PATTERN = /^\/\/\/\s*@param\b(?:\s*\{[^}]+\})?\s+([A-Za-z0-9_]+)/i;
const IMPLICIT_ARGUMENT_NAME_PATTERN = /^argument[0-9]+$/i;

const METHOD_LIST_COMMENT_PATTERN = /^\s*\/\/\s*\./;
const BLANK_LINE_GAP_PATTERN = /\r?\n[ \t]*\r?\n/;

function resolveProgramNode(path): any {
    let programNode = null;
    const parentNode = typeof path.getParentNode === "function" ? path.getParentNode() : null;

    if (path && typeof path.getParentNode === "function") {
        const getParentNode = path.getParentNode;
        try {
            for (let depth = 0; ; depth += 1) {
                const candidate = getParentNode.call(path, depth);
                if (!candidate) break;
                if (candidate.type === "Program") {
                    programNode = candidate;
                    break;
                }
            }
        } catch {
            programNode = parentNode;
        }
    } else {
        programNode = parentNode;
    }

    return programNode;
}

function detachPrintedCommentFromNode(node: any, comment: any) {
    if (node.comments) {
        const idx = node.comments.indexOf(comment);
        if (idx !== -1) {
            node.comments.splice(idx, 1);
        }
    }

    if (
        node.body &&
        node.body.type === "BlockStatement" &&
        Array.isArray(node.body.body) &&
        node.body.body.length > 0
    ) {
        const firstStmt = node.body.body[0];
        if (firstStmt.comments) {
            const idx = firstStmt.comments.indexOf(comment);
            if (idx !== -1) {
                firstStmt.comments.splice(idx, 1);
            }
        }
    }
}

function collectProgramLeadingDocLines({
    programNode,
    nodeStartIndex,
    originalText,
    lineCommentOptions
}: {
    programNode: any;
    nodeStartIndex: number | undefined;
    originalText: string | undefined;
    lineCommentOptions: any;
}) {
    const programLeadingLines: string[] = [];
    if (!programNode || !Array.isArray(programNode.comments) || typeof nodeStartIndex !== "number") {
        return programLeadingLines;
    }

    const programComments = programNode.comments;
    let anchorIndex = nodeStartIndex;

    for (let i = programComments.length - 1; i >= 0; i -= 1) {
        const comment = programComments[i];
        if (!comment || comment.type !== "CommentLine" || comment.printed) {
            continue;
        }

        const commentEnd = typeof comment.end === "number" ? comment.end : (comment.end?.index ?? null);
        const commentStart = typeof comment.start === "number" ? comment.start : (comment.start?.index ?? null);

        if (commentEnd === null || commentStart === null || commentEnd >= anchorIndex) {
            continue;
        }

        if (typeof originalText === "string") {
            const gapText = originalText.slice(commentEnd, anchorIndex);
            const blankLines = Core.getLineBreakCount(gapText);
            if (blankLines >= 2) {
                break;
            }
        }

        const normalized = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
        const trimmed = normalized ? normalized.trim() : "";
        const blankDocSeparator =
            trimmed.length === 0 && typeof comment.value === STRING_TYPE && /^\/\s*$/.test(comment.value.trim());
        if (blankDocSeparator) {
            comment.printed = true;
            anchorIndex = commentStart;
            continue;
        }

        const isDocLike =
            trimmed.startsWith("///") || LINE_DOC_CONT_PATTERN.test(trimmed) || LINE_DOC_AT_PATTERN.test(trimmed);

        if (isDocLike && typeof normalized === STRING_TYPE) {
            programLeadingLines.unshift(normalized);
            comment.printed = true;
            anchorIndex = commentStart;
        } else {
            break;
        }
    }

    return programLeadingLines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("///")) return trimmed;
        return line;
    });
}

function collectMethodListComments(
    originalText: string | null | undefined,
    nodeStartIndex: number | null | undefined
): string[] {
    if (typeof originalText !== STRING_TYPE || typeof nodeStartIndex !== "number") {
        return [];
    }

    const precedingText = originalText.slice(0, nodeStartIndex);
    if (!precedingText) {
        return [];
    }

    const lines = Core.splitLines(precedingText);
    const collected: string[] = [];

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || line.trim().length === 0) {
            if (collected.length > 0) {
                break;
            }
            continue;
        }

        if (!METHOD_LIST_COMMENT_PATTERN.test(line)) {
            if (collected.length > 0) {
                break;
            }
            continue;
        }

        collected.push(line.trim());
    }

    return collected.reverse();
}

function collectProgramLeadingMethodListLines({
    programNode,
    nodeStartIndex,
    originalText,
    lineCommentOptions
}: {
    programNode: any;
    nodeStartIndex: number | undefined;
    originalText: string | undefined;
    lineCommentOptions: any;
}): string[] {
    if (!programNode || !Array.isArray(programNode.comments) || typeof nodeStartIndex !== "number") {
        return [];
    }

    const collected: string[] = [];
    let anchorIndex = nodeStartIndex;

    for (let index = programNode.comments.length - 1; index >= 0; index -= 1) {
        const comment = programNode.comments[index];
        if (!comment || comment.type !== "CommentLine" || comment.printed) {
            continue;
        }

        const commentEnd = typeof comment.end === "number" ? comment.end : (comment.end?.index ?? null);
        const commentStart = typeof comment.start === "number" ? comment.start : (comment.start?.index ?? null);
        if (commentEnd === null || commentStart === null || commentEnd >= anchorIndex) {
            continue;
        }

        if (typeof originalText === STRING_TYPE) {
            const gapText = originalText.slice(commentEnd, anchorIndex);
            if (Core.getLineBreakCount(gapText) >= 2 && collected.length > 0) {
                break;
            }
        }

        if (isBlankDocSeparatorComment(comment, lineCommentOptions)) {
            if (collected.length === 0) {
                break;
            }

            comment.printed = true;
            anchorIndex = commentStart;
            continue;
        }

        const normalized = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
        const trimmed = typeof normalized === STRING_TYPE ? normalized.trim() : "";
        if (!METHOD_LIST_COMMENT_PATTERN.test(trimmed)) {
            if (collected.length > 0) {
                break;
            }
            continue;
        }

        collected.unshift(trimmed);
        comment.printed = true;
        anchorIndex = commentStart;
    }

    return collected;
}

function isBlankDocSeparatorComment(comment: any, lineCommentOptions: any): boolean {
    if (!comment || comment.type !== "CommentLine") {
        return false;
    }

    const normalized = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
    if (typeof normalized === STRING_TYPE && normalized.trim().length === 0) {
        return true;
    }

    return typeof comment.value === STRING_TYPE && /^\/\s*$/.test(comment.value.trim());
}

function formatLineCommentDocEntry(comment: any, lineCommentOptions: any) {
    if (!comment || comment.type !== "CommentLine") {
        return null;
    }

    const normalized = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
    const trimmed = normalized ? normalized.trim() : "";
    if (trimmed.startsWith("///") || LINE_DOC_CONT_PATTERN.test(trimmed) || LINE_DOC_AT_PATTERN.test(trimmed)) {
        return normalized ?? null;
    }

    return null;
}

function collectBlockCommentDocEntries(comment: any, node: any, commentStart: number) {
    const descriptionEntries: { start: number; text: string }[] = [];
    const paramEntries: { start: number; text: string }[] = [];
    const returnsEntries: { start: number; text: string }[] = [];
    const value = comment?.value?.trim();
    if (!value) {
        return [];
    }

    const lines = Core.splitLines(comment.value);
    const hasDocLine = lines.some((line) => {
        let cleanLine = line.trim();
        if (cleanLine.startsWith("*")) {
            cleanLine = cleanLine.slice(1).trim();
        }
        return cleanLine.includes("@") || PARAM_PATTERN.test(cleanLine);
    });

    const isDocLike = value.startsWith("*") || value.includes("@") || PARAM_PATTERN.test(value) || hasDocLine;

    if (!isDocLike) {
        return null;
    }

    const paramNames = new Set<string>();
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            if (param.type === "Identifier") {
                paramNames.add(param.name);
            } else if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
                paramNames.add(param.left.name);
            }
        }
    }

    let seenTagLine = false;
    for (const line of lines) {
        let cleanLine = line.trim();
        if (cleanLine.startsWith("*")) {
            cleanLine = cleanLine.slice(1).trim();
        }
        if (cleanLine === "") continue;

        const paramMatch = cleanLine.match(PARAM_PATTERN);
        if (paramMatch) {
            const params = paramMatch[1].split(",").map((p) => p.trim());
            if (params.length > 0 && params.every((param) => paramNames.has(param))) {
                const desc = paramMatch[2].trim();
                for (const param of params) {
                    paramEntries.push({
                        start: commentStart,
                        text: `/// @param ${param} ${desc}`
                    });
                }
                seenTagLine = true;
                continue;
            }
            continue;
        }

        if (/^it returns?\b/i.test(cleanLine) || /^returns?\b/i.test(cleanLine)) {
            returnsEntries.push({
                start: commentStart,
                text: `/// @returns ${cleanLine}`
            });
            seenTagLine = true;
            continue;
        }

        if (!seenTagLine) {
            descriptionEntries.push({
                start: commentStart,
                text: `/// ${cleanLine}`
            });
        }
    }

    const entries = [...descriptionEntries, ...paramEntries, ...returnsEntries];
    if (entries.length > 0) {
        comment._docCommentBlockConverted = true;
    }
    return entries;
}

function collectNodeLeadingDocs({
    nodeComments,
    node,
    nodeStartIndex,
    lineCommentOptions,
    plainLeadingLines
}: {
    nodeComments: any[];
    node: any;
    nodeStartIndex: number | undefined;
    lineCommentOptions: any;
    plainLeadingLines: string[];
}) {
    const nodeLeadingDocs: { start: number; text: string }[] = [];

    for (const comment of nodeComments) {
        const commentEnd = typeof comment.end === "number" ? comment.end : (comment.end?.index ?? 0);

        const commentStart = typeof comment.start === "number" ? comment.start : (comment.start?.index ?? 0);

        const isOutOfRange =
            typeof nodeStartIndex !== "number" || (commentEnd >= nodeStartIndex && commentStart < nodeStartIndex);

        if (comment.printed || isOutOfRange) {
            continue;
        }

        const normalizedLine = formatDocLikeLineComment(comment, lineCommentOptions, lineCommentOptions.originalText);
        const trimmedNormalizedLine = typeof normalizedLine === STRING_TYPE ? normalizedLine.trim() : "";
        if (METHOD_LIST_COMMENT_PATTERN.test(trimmedNormalizedLine)) {
            plainLeadingLines.push(trimmedNormalizedLine);
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
            continue;
        }

        if (plainLeadingLines.length > 0 && isBlankDocSeparatorComment(comment, lineCommentOptions)) {
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
            continue;
        }

        const lineDoc = formatLineCommentDocEntry(comment, lineCommentOptions);
        if (lineDoc) {
            nodeLeadingDocs.push({
                start: commentStart,
                text: lineDoc
            });
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
            continue;
        }

        if (isBlankDocSeparatorComment(comment, lineCommentOptions)) {
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
            continue;
        }

        const blockEntries = collectBlockCommentDocEntries(comment, node, commentStart);
        if (blockEntries !== null && blockEntries.length > 0) {
            nodeLeadingDocs.push(...blockEntries);
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
        }
    }

    return nodeLeadingDocs;
}

function dedupeDocCommentLines(lines: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
        if (line.trim() === "///") {
            deduped.push(line);
            continue;
        }
        if (!seen.has(line)) {
            seen.add(line);
            deduped.push(line);
        }
    }
    return deduped;
}

function isDescriptionLine(text: string): boolean {
    return /^\/\/\/\s*@description\b/i.test(text.trim());
}

function isDescriptionContinuationLine(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.startsWith("///")) {
        return false;
    }

    return !/^\/\/\/\s*@/i.test(trimmed);
}

function shouldSkipDescriptionSeparator(currentText: string, nextText: string): boolean {
    return isDescriptionLine(currentText) && isDescriptionContinuationLine(nextText);
}

function insertBlankDocSeparators(
    lines: { start: number; text: string }[],
    originalText: string | undefined
): { start: number; text: string }[] {
    if (typeof originalText !== STRING_TYPE || lines.length < 2) {
        return lines;
    }

    const sorted = [...lines].toSorted((a, b) => a.start - b.start);
    const result: { start: number; text: string }[] = [];

    for (let index = 0; index < sorted.length; index += 1) {
        const current = sorted[index];
        const next = sorted[index + 1];
        result.push(current);

        if (!next) {
            continue;
        }

        if (shouldSkipDescriptionSeparator(current.text, next.text)) {
            continue;
        }

        const lineEnd = originalText.indexOf("\n", current.start);
        const endIndex = lineEnd === -1 ? originalText.length : lineEnd;
        if (endIndex >= next.start) {
            continue;
        }

        const between = originalText.slice(endIndex, next.start);
        const blankDocLineCount = between.split(/\r?\n/).filter((line) => /^\s*\/\/\/\s*$/.test(line)).length;

        if (blankDocLineCount > 0) {
            for (let count = 0; count < blankDocLineCount; count += 1) {
                result.push({ start: endIndex + 1 + count, text: "///" });
            }
            continue;
        }

        if (BLANK_LINE_GAP_PATTERN.test(between) && next.text.trim() !== "///") {
            result.push({ start: endIndex + 1, text: "///" });
        }
    }

    return result;
}

function addImplicitParamName(names: Set<string>, value: unknown) {
    if (typeof value !== STRING_TYPE) {
        return;
    }
    const trimmed = (value as string).trim();
    if (trimmed.length === 0) {
        return;
    }
    names.add(trimmed);
    names.add(trimmed.toLowerCase());
}

function collectImplicitParamNames(node: any, options: any): Set<string> {
    const names = new Set<string>();
    try {
        const implicitEntries = Core.collectImplicitArgumentDocNames(node, options);
        if (!Array.isArray(implicitEntries)) {
            return names;
        }
        for (const entry of implicitEntries) {
            if (!entry) {
                continue;
            }
            addImplicitParamName(names, entry.name);
            addImplicitParamName(names, entry.canonical);
            addImplicitParamName(names, entry.fallbackCanonical);
        }
    } catch {
        // Best effort: fail silently if implicit information is unavailable.
    }
    return names;
}

function shouldKeepParamDocLine(line: string, implicitNames: Set<string>): boolean {
    const trimmed = line.trim();
    const match = trimmed.match(PARAM_DOC_LINE_PATTERN);
    if (!match) {
        return true;
    }
    const docName = match[1];
    if (!docName) {
        return true;
    }
    if (implicitNames.has(docName) || implicitNames.has(docName.toLowerCase())) {
        return true;
    }
    if (IMPLICIT_ARGUMENT_NAME_PATTERN.test(docName)) {
        return true;
    }
    return false;
}

/**
 * Collect and normalize raw doc-comment lines associated with a function-like
 * node. The helper gathers doc comments attached directly to the node, leading
 * program-level doc-like comments, and doc-style block comments that precede
 * the node so callers receive a consolidated list of lines ready for further
 * processing.
 */
export function collectFunctionDocCommentDocs({ node, options, path, nodeStartIndex, originalText }: any) {
    const docCommentDocs: MutableDocCommentLines = [];
    const resolvedNodeStartIndex =
        typeof nodeStartIndex === "number" ? nodeStartIndex : (Core.getNodeStartIndex(node) ?? undefined);
    const lineCommentOptions = {
        ...Core.resolveLineCommentOptions(options),
        originalText
    };
    let needsLeadingBlankLine = false;

    const docComments = node.docComments ? [...node.docComments] : [];

    if (Core.isNonEmptyArray(docComments)) {
        const firstDocComment = docComments[0];
        if (
            firstDocComment &&
            typeof firstDocComment.leadingWS === STRING_TYPE &&
            BLANK_LINE_PATTERN.test(firstDocComment.leadingWS)
        ) {
            needsLeadingBlankLine = true;
        }

        const normalizedDocComments = docComments
            .map((comment) => formatDocLikeLineComment(comment, lineCommentOptions, originalText))
            .filter((text) => typeof text === STRING_TYPE && text.trim() !== "");

        docCommentDocs.length = 0;
        docCommentDocs.push(...normalizedDocComments);
    }

    const plainLeadingLines: string[] = [];
    const existingDocLines: MutableDocCommentLines = [];

    const programNode = resolveProgramNode(path);
    const formattedProgramLines = collectProgramLeadingDocLines({
        programNode,
        nodeStartIndex: resolvedNodeStartIndex,
        originalText,
        lineCommentOptions
    });

    docCommentDocs.push(...formattedProgramLines);
    const methodListLines = collectProgramLeadingMethodListLines({
        programNode,
        nodeStartIndex: resolvedNodeStartIndex,
        originalText,
        lineCommentOptions
    });
    if (methodListLines.length > 0) {
        plainLeadingLines.push(...methodListLines);
    } else {
        plainLeadingLines.push(...collectMethodListComments(originalText, resolvedNodeStartIndex));
    }

    const nodeComments = [...(node.comments || [])];

    // If node has no comments, check grandparent VariableDeclaration for static methods
    if (nodeComments.length === 0) {
        const parent = safeGetParentNode(path);
        if (parent && parent.type === "VariableDeclarator") {
            const grandParent = safeGetParentNode(path, 1);
            if (grandParent && grandParent.type === "VariableDeclaration") {
                if (grandParent.comments && grandParent.comments.length > 0) {
                    nodeComments.push(...grandParent.comments);
                } else if (parent.comments && parent.comments.length > 0) {
                    nodeComments.push(...parent.comments);
                } else if (parent.id && parent.id.comments && parent.id.comments.length > 0) {
                    nodeComments.push(...parent.id.comments);
                }
            }
        }
    }

    const nodeLeadingDocs = collectNodeLeadingDocs({
        nodeComments,
        node,
        nodeStartIndex: resolvedNodeStartIndex,
        lineCommentOptions,
        plainLeadingLines
    });

    const formattedNodeDocs = nodeLeadingDocs.map((doc) => {
        const trimmed = doc.text.trim();
        let newText: string;
        if (trimmed.startsWith("///")) {
            newText = trimmed;
        } else if (trimmed.startsWith("//")) {
            newText = `///${trimmed.slice(2)}`;
        } else if (trimmed.startsWith("/")) {
            newText = `///${trimmed.slice(1)}`;
        } else {
            newText = `/// ${trimmed}`;
        }
        return { start: doc.start, text: newText };
    });

    const functionName = Core.getNodeName(node);
    const signatureDescriptionPattern =
        typeof functionName === STRING_TYPE && functionName.length > 0
            ? new RegExp(String.raw`^\/\/\/\s*@description\s*${Core.escapeRegExp(functionName)}\s*\([^)]*\)\s*$`, "i")
            : null;

    const filterDocLines = (lines: { start: number; text: string }[]) => {
        return lines.filter((entry) => {
            if (typeof entry.text !== "string") {
                return true;
            }
            const trimmed = entry.text.trim();
            if (trimmed === "/// @description") {
                return false;
            }
            if (signatureDescriptionPattern && signatureDescriptionPattern.test(trimmed)) {
                return false;
            }
            return true;
        });
    };

    const filteredNodeDocs = filterDocLines(formattedNodeDocs);

    const originalDocDocs: { start: number; text: string }[] = [];
    if (Core.isNonEmptyArray(docComments)) {
        for (const comment of docComments) {
            const formatted = Core.formatLineComment(comment, lineCommentOptions);
            if (formatted && formatted.trim() !== "") {
                originalDocDocs.push({
                    start: comment.start,
                    text: formatted
                });
            }
        }
    }

    const filteredOriginalDocs = filterDocLines(originalDocDocs);

    const mergedDocs = [...filteredOriginalDocs, ...filteredNodeDocs].toSorted((a, b) => a.start - b.start);
    const mergedDocsWithBlanks = insertBlankDocSeparators(mergedDocs, originalText);

    const newDocCommentDocs = mergedDocsWithBlanks.map((x) => x.text);
    const uniqueDocCommentDocs = dedupeDocCommentLines(newDocCommentDocs);

    const hasDeclaredParams = !!(Array.isArray(node?.params) && node.params.length > 0);
    let filteredDocCommentDocs = uniqueDocCommentDocs;
    if (!hasDeclaredParams) {
        const implicitParamNames = collectImplicitParamNames(node, options);
        filteredDocCommentDocs = uniqueDocCommentDocs.filter((line) =>
            shouldKeepParamDocLine(line, implicitParamNames)
        );
    }

    const combinedDocLines = [...formattedProgramLines, ...filteredDocCommentDocs];
    const dedupedDocLines = dedupeDocCommentLines(combinedDocLines);

    docCommentDocs.length = 0;
    docCommentDocs.push(...dedupedDocLines);
    if (plainLeadingLines.length > 1) {
        const dedupedPlainLeadingLines = [...new Set(plainLeadingLines)];
        plainLeadingLines.length = 0;
        plainLeadingLines.push(...dedupedPlainLeadingLines);
    }
    if (nodeComments.some((comment) => comment?._docCommentBlockConverted === true)) {
        (docCommentDocs as any)._blockCommentDocs = true;
    }
    DescriptionUtils.ensureDescriptionContinuations(docCommentDocs);

    return {
        docCommentDocs,
        existingDocLines,
        needsLeadingBlankLine,
        plainLeadingLines
    };
}

/**
 * Apply doc-comment normalization and synthesis rules for function-like nodes.
 * The helper merges synthetic documentation when requested by the core logic
 * and ensures nested functions receive appropriate leading whitespace in the
 * presence of generated doc comments.
 */
export function normalizeFunctionDocCommentDocs({
    docCommentDocs,
    needsLeadingBlankLine,
    node,
    options,
    path,
    overrides
}: any) {
    const normalizedMetadata = NormalizationUtils.getDocCommentNormalization(node);

    if (normalizedMetadata) {
        const docs = normalizedMetadata.docCommentDocs;

        if (
            (normalizedMetadata as any)._preserveDescriptionBreaks === true ||
            (docs as any)._preserveDescriptionBreaks === true
        ) {
            (docs as any)._preserveDescriptionBreaks = true;
        }
        if (
            (normalizedMetadata as any)._suppressLeadingBlank === true ||
            (docs as any)._suppressLeadingBlank === true
        ) {
            (docs as any)._suppressLeadingBlank = true;
        }
        return {
            docCommentDocs: docs,
            needsLeadingBlankLine: normalizedMetadata.needsLeadingBlankLine
        };
    }

    const docCommentOptions = resolveDocCommentPrinterOptions(options);
    const descriptionContinuations = DescriptionUtils.collectDescriptionContinuations(docCommentDocs);
    const preserveDescriptionBreaks =
        Array.isArray(docCommentDocs) && (docCommentDocs as any)._preserveDescriptionBreaks === true;
    void node;
    void docCommentOptions;
    void path;
    void overrides;
    docCommentDocs = DescriptionUtils.applyDescriptionContinuations(docCommentDocs, descriptionContinuations);

    if (Array.isArray(docCommentDocs) && (docCommentDocs as any)._blockCommentDocs === true) {
        docCommentDocs = docCommentDocs.map((line) => {
            if (typeof line !== STRING_TYPE) {
                return line;
            }

            const match = line.match(/^(\s*\/\/\/\s*@param\s+)(\S+)\s+-\s+(.*)$/);
            if (!match) {
                return line;
            }

            const [, prefix, token, description] = match;
            if (token.startsWith("{")) {
                return line;
            }

            return `${prefix}${token} ${description}`;
        }) as MutableDocCommentLines;
    }

    docCommentDocs = removeFunctionDocCommentLines(docCommentDocs);

    if (preserveDescriptionBreaks && Array.isArray(docCommentDocs)) {
        (docCommentDocs as any)._preserveDescriptionBreaks = true;
    }

    return { docCommentDocs, needsLeadingBlankLine };
}
