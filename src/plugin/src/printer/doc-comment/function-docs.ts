import { Core, type MutableDocCommentLines } from "@gml-modules/core";

import { resolveDocCommentPrinterOptions } from "./doc-comment-options.js";
import {
    applyDescriptionContinuations,
    collectDescriptionContinuations,
    ensureDescriptionContinuations
} from "../../shared/doc-comment-description.js";
import { getDocCommentNormalization } from "../../shared/doc-comment-normalization.js";

const STRING_TYPE = "string";

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
            typeof firstDocComment.leadingWS === STRING_TYPE
        ) {
            const blankLinePattern =
                /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/;
            if (blankLinePattern.test(firstDocComment.leadingWS)) {
                needsLeadingBlankLine = true;
            }
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
    const programLeadingLines: string[] = [];
    if (
        programNode &&
        Array.isArray(programNode.comments) &&
        typeof nodeStartIndex === "number"
    ) {
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

            const formatted = Core.formatLineComment(
                comment,
                lineCommentOptions
            );
            const trimmed = formatted ? formatted.trim() : "";

            const isDocLike =
                trimmed.startsWith("///") ||
                /^\/\/\s*\/(\s|$)/.test(trimmed) ||
                /^\/\/\s*@/.test(trimmed);

            if (isDocLike) {
                programLeadingLines.unshift(formatted);
                comment.printed = true;
                anchorIndex = commentStart;
            } else {
                break;
            }
        }
    }

    const formattedProgramLines = programLeadingLines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("///")) return trimmed;
        return line;
    });

    docCommentDocs.push(...formattedProgramLines);

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

        // We process the comment if it's not printed AND:
        // 1. It's before the function (leading comment)
        // 2. OR it's inside the function (start >= nodeStartIndex) - likely from the body
        if (
            !comment.printed &&
            (commentEnd < nodeStartIndex || commentStart >= nodeStartIndex)
        ) {
            if (comment.type === "CommentLine") {
                const formatted = Core.formatLineComment(
                    comment,
                    lineCommentOptions
                );
                const trimmed = formatted ? formatted.trim() : "";
                const isDocLike =
                    trimmed.startsWith("///") ||
                    /^\/\/\s*\/(\s|$)/.test(trimmed) ||
                    /^\/\/\s*@/.test(trimmed);

                if (isDocLike) {
                    nodeLeadingDocs.push({
                        start: commentStart,
                        text: formatted
                    });
                    comment.printed = true;
                    if (node.comments) {
                        const idx = node.comments.indexOf(comment);
                        if (idx !== -1) node.comments.splice(idx, 1);
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
                            if (idx !== -1) firstStmt.comments.splice(idx, 1);
                        }
                    }
                }
            } else if (comment.type === "CommentBlock") {
                const value = comment.value.trim();
                // Check for JSDoc-style (*) or @tags, OR GML-style parameter lists (param : desc)
                const isDocLike =
                    value.startsWith("*") ||
                    value.includes("@") ||
                    /^[ \t]*\w+(?:[ \t]*,[ \t]*\w+)*[ \t]*:/m.test(value);

                if (isDocLike) {
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

                    const lines = comment.value.split(/\r\n|\r|\n/);
                    for (const line of lines) {
                        let cleanLine = line.trim();
                        if (cleanLine.startsWith("*")) {
                            cleanLine = cleanLine.slice(1).trim();
                        }
                        if (cleanLine === "") continue;

                        // Check for param pattern: "param1, param2 : description"
                        const paramMatch = cleanLine.match(
                            /^([a-zA-Z0-9_]+(?:[ \t]*,[ \t]*[a-zA-Z0-9_]+)*)[ \t]*:[ \t]*(.*)$/
                        );

                        let isParamLine = false;
                        if (paramMatch) {
                            const params = paramMatch[1]
                                .split(",")
                                .map((p) => p.trim());
                            // Only treat as param line if ALL listed names are actual parameters of the function.
                            // This avoids false positives like "Note: this is important".
                            if (
                                params.length > 0 &&
                                params.every((p) => paramNames.has(p))
                            ) {
                                isParamLine = true;
                                const desc = paramMatch[2].trim();
                                for (const param of params) {
                                    nodeLeadingDocs.push({
                                        start: commentStart,
                                        text: `/// @param ${param} ${desc}`
                                    });
                                }
                            }
                        }

                        if (!isParamLine) {
                            nodeLeadingDocs.push({
                                start: commentStart,
                                text: `/// ${cleanLine}`
                            });
                        }
                    }
                    comment.printed = true;
                    if (node.comments) {
                        const idx = node.comments.indexOf(comment);
                        if (idx !== -1) node.comments.splice(idx, 1);
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
                            if (idx !== -1) firstStmt.comments.splice(idx, 1);
                        }
                    }
                }
            }
        }
    }

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

    const filteredNodeDocs = formattedNodeDocs.filter(
        (entry) =>
            typeof entry.text !== "string" ||
            entry.text.trim() !== "/// @description"
    );

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

    return { docCommentDocs, needsLeadingBlankLine };
}
