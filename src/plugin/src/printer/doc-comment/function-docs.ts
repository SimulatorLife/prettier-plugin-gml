import { Core, type MutableDocCommentLines } from "@gml-modules/core";
import { removeFunctionDocCommentLines } from "../../doc-comment/function-tag-filter.js";

import { resolveDocCommentPrinterOptions } from "./doc-comment-options.js";
import {
    applyDescriptionContinuations,
    collectDescriptionContinuations,
    ensureDescriptionContinuations
} from "../../transforms/doc-comment/description-utils.js";
import { getDocCommentNormalization } from "../../transforms/doc-comment/normalization-utils.js";
import { normalizeDocLikeLineComment } from "../../comments/doc-like-line-normalization.js";

const STRING_TYPE = "string";
const BLANK_LINE_PATTERN =
    /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
const LINE_DOC_CONT_PATTERN = /^\/\/\s*\/(\s|$)/;
const LINE_DOC_AT_PATTERN = /^\/\/\s*@/;
const PARAM_PATTERN =
    /^([a-zA-Z0-9_]+(?:[ \t]*,[ \t]*[a-zA-Z0-9_]+)*)[ \t]*:[ \t]*(.*)$/;

const METHOD_LIST_COMMENT_PATTERN = /^\s*\/\/\s*\./;

function resolveProgramNode(path): any {
    let programNode = null;
    const parentNode =
        typeof path.getParentNode === "function" ? path.getParentNode() : null;

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
    if (
        !programNode ||
        !Array.isArray(programNode.comments) ||
        typeof nodeStartIndex !== "number"
    ) {
        return programLeadingLines;
    }

    const programComments = programNode.comments;
    let anchorIndex = nodeStartIndex;

    for (let i = programComments.length - 1; i >= 0; i -= 1) {
        const comment = programComments[i];
        if (!comment || comment.type !== "CommentLine" || comment.printed) {
            continue;
        }

        const commentEnd =
            typeof comment.end === "number"
                ? comment.end
                : (comment.end?.index ?? null);
        const commentStart =
            typeof comment.start === "number"
                ? comment.start
                : (comment.start?.index ?? null);

        if (
            commentEnd === null ||
            commentStart === null ||
            commentEnd >= anchorIndex
        ) {
            continue;
        }

        if (typeof originalText === "string") {
            const gapText = originalText.slice(commentEnd, anchorIndex);
            const blankLines = (gapText.match(/\n/g) || []).length;
            if (blankLines >= 2) {
                break;
            }
        }

        const formatted = Core.formatLineComment(comment, lineCommentOptions);
        const normalized =
            typeof formatted === STRING_TYPE
                ? normalizeDocLikeLineComment(
                      comment,
                      formatted,
                      lineCommentOptions.originalText
                  )
                : formatted;
        const trimmed = normalized ? normalized.trim() : "";

        const isDocLike =
            trimmed.startsWith("///") ||
            LINE_DOC_CONT_PATTERN.test(trimmed) ||
            LINE_DOC_AT_PATTERN.test(trimmed);

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
    if (
        typeof originalText !== STRING_TYPE ||
        typeof nodeStartIndex !== "number"
    ) {
        return [];
    }

    const precedingText = originalText.slice(0, nodeStartIndex);
    if (!precedingText) {
        return [];
    }

    const lines = precedingText.split(/\r\n|\n|\r/);
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

function formatLineCommentDocEntry(comment: any, lineCommentOptions: any) {
    if (!comment || comment.type !== "CommentLine") {
        return null;
    }

    const formatted = Core.formatLineComment(comment, lineCommentOptions);
    const normalized =
        typeof formatted === STRING_TYPE
            ? normalizeDocLikeLineComment(
                  comment,
                  formatted,
                  lineCommentOptions.originalText
              )
            : formatted;
    const trimmed = normalized ? normalized.trim() : "";
    if (
        trimmed.startsWith("///") ||
        LINE_DOC_CONT_PATTERN.test(trimmed) ||
        LINE_DOC_AT_PATTERN.test(trimmed)
    ) {
        return normalized ?? null;
    }

    return null;
}

function collectBlockCommentDocEntries(
    comment: any,
    node: any,
    commentStart: number
) {
    const descriptionEntries: { start: number; text: string }[] = [];
    const paramEntries: { start: number; text: string }[] = [];
    const returnsEntries: { start: number; text: string }[] = [];
    const value = comment?.value?.trim();
    if (!value) {
        return [];
    }

    const lines = comment.value.split(/\r\n|\r|\n/);
    const hasDocLine = lines.some((line) => {
        let cleanLine = line.trim();
        if (cleanLine.startsWith("*")) {
            cleanLine = cleanLine.slice(1).trim();
        }
        return cleanLine.includes("@") || PARAM_PATTERN.test(cleanLine);
    });

    const isDocLike =
        value.startsWith("*") ||
        value.includes("@") ||
        PARAM_PATTERN.test(value) ||
        hasDocLine;

    if (!isDocLike) {
        return [];
    }

    const paramNames = new Set<string>();
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            if (param.type === "Identifier") {
                paramNames.add(param.name);
            } else if (
                param.type === "AssignmentPattern" &&
                param.left.type === "Identifier"
            ) {
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
            if (
                params.length > 0 &&
                params.every((param) => paramNames.has(param))
            ) {
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

        if (
            /^it returns?\b/i.test(cleanLine) ||
            /^returns?\b/i.test(cleanLine)
        ) {
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
    lineCommentOptions
}: {
    nodeComments: any[];
    node: any;
    nodeStartIndex: number | undefined;
    lineCommentOptions: any;
}) {
    const nodeLeadingDocs: { start: number; text: string }[] = [];

    for (const comment of nodeComments) {
        const commentEnd =
            typeof comment.end === "number"
                ? comment.end
                : (comment.end?.index ?? 0);

        const commentStart =
            typeof comment.start === "number"
                ? comment.start
                : (comment.start?.index ?? 0);

        const isOutOfRange =
            typeof nodeStartIndex !== "number" ||
            (commentEnd >= nodeStartIndex && commentStart < nodeStartIndex);

        if (comment.printed || isOutOfRange) {
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

        const blockEntries = collectBlockCommentDocEntries(
            comment,
            node,
            commentStart
        );
        if (blockEntries.length > 0) {
            nodeLeadingDocs.push(...blockEntries);
            comment.printed = true;
            detachPrintedCommentFromNode(node, comment);
        }
    }

    return nodeLeadingDocs;
}

/**
 * Collect and normalize raw doc-comment lines associated with a function-like
 * node. The helper gathers doc comments attached directly to the node, leading
 * program-level doc-like comments, and doc-style block comments that precede
 * the node so callers receive a consolidated list of lines ready for further
 * processing.
 */
export function collectFunctionDocCommentDocs({
    node,
    options,
    path,
    nodeStartIndex,
    originalText
}: any) {
    const docCommentDocs: MutableDocCommentLines = [];
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
            .map((comment) =>
                Core.formatLineComment(comment, lineCommentOptions)
            )
            .filter(
                (text) => typeof text === STRING_TYPE && text.trim() !== ""
            );

        docCommentDocs.length = 0;
        docCommentDocs.push(...normalizedDocComments);
    }

    const plainLeadingLines: string[] = [];
    const existingDocLines: MutableDocCommentLines = [];

    const programNode = resolveProgramNode(path);
    const formattedProgramLines = collectProgramLeadingDocLines({
        programNode,
        nodeStartIndex,
        originalText,
        lineCommentOptions
    });

    docCommentDocs.push(...formattedProgramLines);
    plainLeadingLines.push(
        ...collectMethodListComments(originalText, nodeStartIndex)
    );

    const nodeComments = [...(node.comments || [])];

    // If node has no comments, check grandparent VariableDeclaration for static methods
    if (nodeComments.length === 0) {
        const parent = path.getParentNode();
        if (parent && parent.type === "VariableDeclarator") {
            const grandParent = path.getParentNode(1);
            if (grandParent && grandParent.type === "VariableDeclaration") {
                if (grandParent.comments && grandParent.comments.length > 0) {
                    nodeComments.push(...grandParent.comments);
                } else if (parent.comments && parent.comments.length > 0) {
                    nodeComments.push(...parent.comments);
                } else if (
                    parent.id &&
                    parent.id.comments &&
                    parent.id.comments.length > 0
                ) {
                    nodeComments.push(...parent.id.comments);
                }
            }
        }
    }

    // Also consider comments attached to the first statement of the function body
    // as they might be intended as function documentation (e.g. inside the braces).
    if (
        node.body &&
        node.body.type === "BlockStatement" &&
        Array.isArray(node.body.body) &&
        node.body.body.length > 0
    ) {
        const firstStatement = node.body.body[0];
        if (firstStatement && Core.isNonEmptyArray(firstStatement.comments)) {
            // We append these to the list of comments to check.
            // We'll rely on the isDocLike check to avoid picking up regular comments.
            nodeComments.push(...firstStatement.comments);
        }
    }

    const nodeLeadingDocs = collectNodeLeadingDocs({
        nodeComments,
        node,
        nodeStartIndex,
        lineCommentOptions
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
            ? new RegExp(
                  String.raw`^\/\/\/\s*@description\s*${Core.escapeRegExp(
                      functionName
                  )}\s*\([^)]*\)\s*$`,
                  "i"
              )
            : null;

    const filteredNodeDocs = formattedNodeDocs.filter((entry) => {
        if (typeof entry.text !== "string") {
            return true;
        }
        const trimmed = entry.text.trim();
        if (trimmed === "/// @description") {
            return false;
        }
        if (
            signatureDescriptionPattern &&
            signatureDescriptionPattern.test(trimmed)
        ) {
            return false;
        }
        return true;
    });

    const originalDocDocs: { start: number; text: string }[] = [];
    if (Core.isNonEmptyArray(docComments)) {
        for (const comment of docComments) {
            const formatted = Core.formatLineComment(
                comment,
                lineCommentOptions
            );
            if (formatted && formatted.trim() !== "") {
                originalDocDocs.push({
                    start: comment.start,
                    text: formatted
                });
            }
        }
    }

    const mergedDocs = [...originalDocDocs, ...filteredNodeDocs].sort(
        (a, b) => a.start - b.start
    );

    const newDocCommentDocs = mergedDocs.map((x) => x.text);

    const uniqueProgramLines = formattedProgramLines.filter(
        (line) => !newDocCommentDocs.includes(line)
    );

    docCommentDocs.length = 0;
    docCommentDocs.push(...uniqueProgramLines, ...newDocCommentDocs);
    if (
        nodeComments.some(
            (comment) => comment?._docCommentBlockConverted === true
        )
    ) {
        (docCommentDocs as any)._blockCommentDocs = true;
    }
    ensureDescriptionContinuations(docCommentDocs);

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
    const normalizedMetadata = getDocCommentNormalization(node);

    if (normalizedMetadata) {
        return {
            docCommentDocs: normalizedMetadata.docCommentDocs,
            needsLeadingBlankLine: normalizedMetadata.needsLeadingBlankLine
        };
    }

    const docCommentOptions = resolveDocCommentPrinterOptions(options);
    const descriptionContinuations =
        collectDescriptionContinuations(docCommentDocs);

    if (
        Core.shouldGenerateSyntheticDocForFunction(
            path,
            docCommentDocs,
            docCommentOptions
        )
    ) {
        docCommentDocs = Core.toMutableArray(
            Core.mergeSyntheticDocComments(
                node,
                docCommentDocs,
                docCommentOptions,
                overrides
            )
        ) as MutableDocCommentLines;

        docCommentDocs = applyDescriptionContinuations(
            docCommentDocs,
            descriptionContinuations
        );
        if (Array.isArray(docCommentDocs)) {
            while (
                docCommentDocs.length > 0 &&
                typeof docCommentDocs[0] === STRING_TYPE &&
                docCommentDocs[0].trim() === ""
            ) {
                docCommentDocs.shift();
            }
        }
        const parentNode = path.getParentNode();
        if (
            parentNode &&
            parentNode.type === "BlockStatement" &&
            !needsLeadingBlankLine
        ) {
            needsLeadingBlankLine = true;
        }
    }

    if (
        Array.isArray(docCommentDocs) &&
        (docCommentDocs as any)._blockCommentDocs === true
    ) {
        docCommentDocs = docCommentDocs.map((line) => {
            if (typeof line !== STRING_TYPE) {
                return line;
            }

            const match = line.match(
                /^(\s*\/\/\/\s*@param\s+)(\S+)\s+-\s+(.*)$/
            );
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
    docCommentDocs = wrapDocDescriptionLines(
        docCommentDocs,
        docCommentOptions.docCommentMaxWrapWidth
    );

    return { docCommentDocs, needsLeadingBlankLine };
}
