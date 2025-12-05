import {
    asArray,
    isNonEmptyArray,
    toMutableArray,
    toTrimmedString
} from "../../../utils/index.js";
import { getCommentArray } from "../../comment-utils.js";
import { getDocCommentPrinterDependencies } from "../printer-dependencies.js";
import type { DocCommentPrinterDependencies } from "../types.js";

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";

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
    const deps = dependencies ?? getDocCommentPrinterDependencies();
    const rawComments = getCommentArray(node);

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

        let formatted = deps.formatLineComment(comment, lineCommentOptions);
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
            const nodeStartIndexFinal = getNodeStartIndexForDocComments(
                node,
                options
            );
            if (Number.isInteger(nodeStartIndexFinal)) {
                const docCandidates: any[] = [];
                let anchorIndex = nodeStartIndexFinal;
                for (let i = programCommentArray.length - 1; i >= 0; --i) {
                    const pc = programCommentArray[i];
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
                    const fallbackOptions =
                        deps.resolveLineCommentOptions(options);
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
                    const fallbackOptions =
                        deps.resolveLineCommentOptions(options);
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
    const deps = dependencies ?? getDocCommentPrinterDependencies();
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

        const formatted = deps.formatLineComment(comment, lineCommentOptions);
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
    const deps = dependencies ?? getDocCommentPrinterDependencies();
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
