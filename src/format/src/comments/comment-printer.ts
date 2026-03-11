// Comment handling helpers relocated to the format workspace so Prettier can format comments directly.

import { Core } from "@gml-modules/core";
import { util } from "prettier";
import { builders } from "prettier/doc";

import { countTrailingBlankLines } from "../printer/semicolons.js";
import { formatDocLikeLineComment, shouldPreserveRawFormatterLineComment } from "./doc-like-line-normalization.js";

const { isObjectLike } = Core;

const { addDanglingComment, addLeadingComment } = util;
const { join, hardline } = builders;

type PrinterComment = {
    type?: "CommentLine" | "CommentBlock";
    value?: string;
    enclosingNode?: any;
    precedingNode?: any;
    followingNode?: any;
    printed?: boolean;
    attachToBrace?: boolean;
    attachToClauseBody?: boolean;
    [key: string]: any;
};

function hasTypeProperty(value: unknown): value is { type?: string } {
    return value !== null && typeof value === "object";
}

const EMPTY_BODY_TARGETS = [{ type: "BlockStatement", property: "body" }];

const EMPTY_PARENS_TARGETS = [
    { type: "CallExpression", property: "arguments" },
    { type: "ConstructorParentClause", property: "params" },
    { type: "FunctionDeclaration", property: "params" },
    { type: "ConstructorDeclaration", property: "params" }
];

const EMPTY_LITERAL_TARGETS = [
    { type: "ArrayExpression", property: "elements" },
    { type: "StructExpression", property: "properties" },
    { type: "EnumDeclaration", property: "members" }
];

const LEGACY_LINE_DOC_TAG_PATTERN =
    /^\s*\/\/\s*@(?:arg|args|argument|parameter|param|returns?|description|function|func)\b/i;
const BLOCK_DOC_TAG_PATTERN = /^\s*@(?:arg|args|argument|parameter|param|returns?|description|function|func)\b/i;

/**
 * Pre-compiled pattern for identifying decorative slash banner lines inside
 * block comments.  The threshold (`minLeadingSlashes`) is a frozen constant in
 * `Core.DEFAULT_BANNER_COMMENT_POLICY_CONFIG`, so the resulting `RegExp` is
 * identical on every call.  Hoisting it to module scope means a single object
 * is shared across all invocations of {@link hasDecorativeSlashBanner} instead
 * of allocating—and immediately discarding—a new `RegExp` for each block
 * comment candidate encountered during a formatting run.
 */
const DECORATIVE_SLASH_LINE_PATTERN = new RegExp(
    String.raw`^\s*\*?\/{${Core.DEFAULT_BANNER_COMMENT_POLICY_CONFIG.minLeadingSlashes},}\*?\s*$`
);

function attachDanglingCommentToEmptyNode(
    comment: PrinterComment,
    descriptors: Array<{ type: string; property: string }>
) {
    const node = comment.enclosingNode;
    if (!node) {
        return false;
    }

    for (const { type, property } of descriptors) {
        if (node.type !== type) {
            continue;
        }

        const collection = node[property];
        const isEmptyArray = Array.isArray(collection) && collection.length === 0;
        const isCollectionMissing = collection == null;
        if (isEmptyArray || isCollectionMissing) {
            addDanglingComment(node, comment, false);
            return true;
        }
    }

    return false;
}

const OWN_LINE_COMMENT_HANDLERS = [
    handleDecorativeBlockCommentOwnLine,
    handleCommentInEmptyBody,
    handleCommentInEmptyParens,
    handleOnlyComments
];

const COMMON_COMMENT_HANDLERS = [
    handleOnlyComments,
    handleClauseBlockIntroComment,
    handleCommentAttachedToOpenBrace,
    handleCommentInEmptyParens
];

const END_OF_LINE_COMMENT_HANDLERS = [
    handleDecorativeBlockCommentOwnLine,
    handleDetachedOwnLineComment,
    ...COMMON_COMMENT_HANDLERS,
    handleMacroComments
];

const REMAINING_COMMENT_HANDLERS = [
    handleDecorativeBlockCommentOwnLine,
    handleDetachedOwnLineComment,
    ...COMMON_COMMENT_HANDLERS,
    handleCommentInEmptyLiteral,
    handleMacroComments
];

function runCommentHandlers(handlers, comment, text, options, ast, isLastComment) {
    for (const handler of handlers) {
        if (handler(comment, text, options, ast, isLastComment)) {
            return true;
        }
    }

    return false;
}

function shouldSuppressComment(comment, options) {
    if (comment.printed === true) {
        return true;
    }
    if (comment.type !== "CommentLine") {
        return false;
    }
    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formatted = formatDocLikeLineComment(comment, lineCommentOptions, options?.originalText);
    return formatted === null || formatted === "";
}

function suppressFormattedComment(comment, options) {
    if (!shouldSuppressComment(comment, options)) {
        return false;
    }

    const targetComment = comment;
    targetComment.printed = true;
    return true;
}

const handleComments = {
    ownLine(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(OWN_LINE_COMMENT_HANDLERS, comment, text, options, ast, isLastComment);
    },
    endOfLine(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(END_OF_LINE_COMMENT_HANDLERS, comment, text, options, ast, isLastComment);
    },
    remaining(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(REMAINING_COMMENT_HANDLERS, comment, text, options, ast, isLastComment);
    }
};

function printComment(commentPath, options) {
    const comment = commentPath.getValue();

    if (!Core.isCommentNode(comment)) {
        if (Core.isObjectLike(comment)) {
            comment.printed = true;
        }
        return "";
    }

    applyTrailingCommentPadding(comment);
    applyBottomCommentInlinePadding(comment, options);
    applySingleLeadingSpacePadding(comment, options);
    if (comment?._structPropertyTrailing) {
        comment._structPropertyHandled = true;
        comment.printed = true;
        return "";
    }
    comment.printed = true;

    switch (comment.type) {
        case "CommentBlock": {
            const trimmed = comment.value.trim();
            if (trimmed === "" || trimmed === "*") {
                return "";
            }
            const preservedCommentedOut = formatCommentedOutCodeBlockComment(comment);
            if (preservedCommentedOut !== null) {
                return preservedCommentedOut;
            }
            const decorated = formatDecorativeBlockComment(comment, options?.originalText);
            if (decorated !== null) {
                if (decorated === "") {
                    return "";
                }
                if (typeof comment.inlinePadding === "number") {
                    comment.inlinePadding = 0;
                }

                const endIndexRaw =
                    typeof comment.end === "number"
                        ? comment.end
                        : typeof comment.end === "object" &&
                            comment.end !== null &&
                            "index" in comment.end &&
                            typeof comment.end.index === "number"
                          ? comment.end.index
                          : comment.end;
                const endIndex = typeof endIndexRaw === "number" ? endIndexRaw : 0;
                const blankLines = countTrailingBlankLines(options.originalText, endIndex + 1);
                const isAttachedLeadingComment =
                    comment.trailing !== true && (comment as PrinterComment).followingNode != null;

                const hasSourceLeadingBlankLine = hasSimpleLeadingBlankLineInSource(comment, options?.originalText);
                const hasLeadingWhitespaceBlankLine = hasLeadingBlankLineInWhitespace(comment);
                const shouldPrependDecorativeBlankLine =
                    comment._gmlForceLeadingBlankLine !== true &&
                    !hasLeadingWhitespaceBlankLine &&
                    hasSourceLeadingBlankLine;

                if (isAttachedLeadingComment) {
                    comment.leadingWS = "";
                    comment.trailingWS = "\n";
                    comment.leading = true;
                    comment.trailing = false;
                    comment.placement = "ownLine";
                } else {
                    comment.trailingWS = "\n";
                }

                const parts = [];
                if (shouldPrependDecorativeBlankLine) {
                    parts.push(hardline);
                }

                // When forcing a leading blank line for decorated comments, reset leadingWS
                // so we extract the correct indentation (or lack thereof)
                if (comment._gmlForceLeadingBlankLine === true) {
                    comment.leadingWS = "\n";
                }

                const decoratedWithLeadingPadding =
                    comment._gmlForceLeadingBlankLine === true ? `\n\n${decorated}` : decorated;
                parts.push(decoratedWithLeadingPadding);

                const shouldAppendTrailingHardline = comment._gmlForceLeadingBlankLine === true;

                if (shouldAppendTrailingHardline) {
                    if (blankLines > 0) {
                        parts.push(hardline, hardline);
                    } else {
                        parts.push(hardline);
                    }
                }

                return parts.length === 1 ? parts[0] : parts;
            }
            const canonicalTopLevelBlockComment = formatCanonicalTopLevelBlockComment(comment, options?.originalText);
            if (canonicalTopLevelBlockComment !== null) {
                return canonicalTopLevelBlockComment;
            }

            return formatNonDecorativeBlockComment(comment);
        }
        case "CommentLine": {
            const isOwnLineComment =
                comment.trailing !== true &&
                comment.placement !== "endOfLine" &&
                !hasInlineContentBeforeComment(comment, options);
            if (isOwnLineComment) {
                comment.inlinePadding = 0;
            }

            const lineCommentOptions = Core.resolveLineCommentOptions(options);
            const formattingOptions = {
                ...lineCommentOptions,
                originalText: options.originalText
            };
            const rawText = Core.getLineCommentRawText(comment, {
                originalText: options?.originalText
            });
            const preserveRawLineComment = shouldPreserveRawFormatterLineComment(
                comment,
                rawText,
                options?.originalText
            );
            const sourceIndentationWidth = resolveCommentSourceIndentationWidth(comment, options?.originalText);
            const previousSignificantCharacter = resolvePreviousSignificantSourceCharacterBeforeComment(
                comment,
                options?.originalText
            );
            const previousSignificantIndex = resolvePreviousSignificantSourceIndexBeforeComment(
                comment,
                options?.originalText
            );
            const previousSignificantIsCommentedOutBrace =
                previousSignificantCharacter === "}" &&
                previousSignificantIndex !== null &&
                isSourceIndexInsideLineComment(previousSignificantIndex, options?.originalText);
            const allowSourceDrivenBlankLinePrepend =
                (sourceIndentationWidth === 0 || previousSignificantCharacter === "{") &&
                previousSignificantCharacter !== null &&
                previousSignificantCharacter !== "/" &&
                previousSignificantCharacter !== "*" &&
                !previousSignificantIsCommentedOutBrace &&
                !hasTopLevelDocLineImmediatelyBeforeComment(comment, options?.originalText);
            let normalized = formatDocLikeLineComment(comment, formattingOptions, options?.originalText) ?? "";
            if (normalized === "") {
                if (/^\s*\/\/\/\s*$/.test(rawText)) {
                    collapseSuppressedTripleSlashSeparatorWhitespace(comment);
                }
                return "";
            }
            // Strip any leading whitespace characters from the comment text itself since
            // Prettier will supply the correct indentation for us. This prevents
            // situations like `    \t// TODO` when the source already included a tab.
            normalized = normalized.replace(/^[ \t]+/, "");
            const normalizedTrimmedStart = normalized.trimStart();
            const isMethodListCommentLine = /^\/\/\s+\.[A-Za-z_]/.test(normalizedTrimmedStart);
            const preservedCommentShouldPrependBlankLine =
                comment._gmlForceLeadingBlankLine === true ||
                (allowSourceDrivenBlankLinePrepend &&
                    !hasLeadingBlankLineInWhitespace(comment) &&
                    hasSimpleLeadingBlankLineInSource(comment, options?.originalText));
            const normalizedCommentShouldPrependBlankLine =
                comment._gmlForceLeadingBlankLine === true ||
                (allowSourceDrivenBlankLinePrepend && hasLeadingBlankLineInSource(comment, options?.originalText));
            const shouldPrependBlankLine =
                !isMethodListCommentLine &&
                (preserveRawLineComment
                    ? preservedCommentShouldPrependBlankLine
                    : normalizedCommentShouldPrependBlankLine);
            if (shouldPrependBlankLine) {
                return [hardline, normalized];
            }
            if (isMethodListCommentLine && isMethodListTerminalCommentBeforeFunction(comment, options?.originalText)) {
                return [normalized, hardline];
            }
            return normalized;
        }
        default: {
            throw new Error(`Unknown comment type`);
        }
    }
}

/**
 * Preserve a single leading space preceding a comment when that space is the
 * first character on its line. Prettier normally normalizes whitespace before
 * comments, but in GML files a solitary indent after a newline often indicates
 * intent (for example, banner-like separators). This helper records the needed
 * inline padding without altering trailing/leading classifications so the
 * printer can respect the original layout.
 */
function applySingleLeadingSpacePadding(comment, options) {
    if (!Core.isObjectLike(comment) || !options) {
        return;
    }

    const sourceSpan = resolveCommentSourceSpan(comment, options.originalText);
    if (!sourceSpan || sourceSpan.startIndex <= 0) {
        return;
    }

    const { originalText, startIndex } = sourceSpan;
    const precedingChar = originalText[startIndex - 1];
    if (precedingChar !== " ") {
        return;
    }

    const beforePrecedingIndex = startIndex - 2;
    const beforePrecedingChar = beforePrecedingIndex >= 0 ? originalText[beforePrecedingIndex] : "\n";

    if (beforePrecedingChar !== "\n" && beforePrecedingChar !== "\r") {
        return;
    }

    comment.inlinePadding = typeof comment.inlinePadding === "number" ? Math.max(comment.inlinePadding, 1) : 1;
}

function getCommentStartIndex(comment) {
    const start = comment?.start;
    if (typeof start === "number") {
        return start;
    }

    if (start && typeof start.index === "number") {
        return start.index;
    }

    return null;
}

function resolveCommentSourceSpan(comment, originalText) {
    if (!Core.isObjectLike(comment)) {
        return null;
    }

    if (typeof originalText !== "string") {
        return null;
    }

    const startIndex = getCommentStartIndex(comment);
    const endIndex = getCommentEndIndex(comment);

    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex < startIndex) {
        return null;
    }

    return { startIndex, endIndex, originalText };
}

function hasLeadingBlankLineInWhitespace(comment): boolean {
    const leadingWhitespace = typeof comment?.leadingWS === "string" ? comment.leadingWS : "";
    return /\n[\t ]*\n/u.test(leadingWhitespace);
}

function resolveCommentSourceIndentationWidth(comment, originalText): number | null {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return null;
    }

    const { startIndex } = sourceSpan;
    const previousLineBreakIndex = sourceSpan.originalText.lastIndexOf("\n", startIndex - 1);
    const lineStartIndex = previousLineBreakIndex === -1 ? 0 : previousLineBreakIndex + 1;
    const linePrefix = sourceSpan.originalText.slice(lineStartIndex, startIndex).replaceAll("\r", "");
    if (linePrefix.trim().length > 0) {
        return null;
    }

    return linePrefix.replaceAll("\t", "    ").length;
}

function resolvePreviousSignificantSourceCharacterBeforeComment(comment, originalText): string | null {
    const sourceIndex = resolvePreviousSignificantSourceIndexBeforeComment(comment, originalText);
    if (sourceIndex === null) {
        return null;
    }

    return originalText[sourceIndex] ?? null;
}

function resolvePreviousSignificantSourceIndexBeforeComment(comment, originalText): number | null {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return null;
    }

    for (let index = sourceSpan.startIndex - 1; index >= 0; index -= 1) {
        const char = sourceSpan.originalText[index];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            continue;
        }

        return index;
    }

    return null;
}

function isSourceIndexInsideLineComment(index: number, originalText: string | null | undefined): boolean {
    if (typeof originalText !== "string" || index < 0 || index >= originalText.length) {
        return false;
    }

    const lineStartIndex = originalText.lastIndexOf("\n", index);
    const linePrefix = originalText.slice(lineStartIndex === -1 ? 0 : lineStartIndex + 1, index + 1);
    return linePrefix.includes("//");
}

function hasTopLevelDocLineImmediatelyBeforeComment(comment, originalText): boolean {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return false;
    }

    const lines = sourceSpan.originalText.slice(0, sourceSpan.startIndex).split(/\r?\n/u);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index] ?? "";
        if (line.trim().length === 0) {
            continue;
        }

        return line.startsWith("///");
    }

    return false;
}

function hasLeadingBlankLineInSource(comment, originalText) {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return false;
    }

    const { startIndex } = sourceSpan;
    let newlineCount = 0;
    let index = startIndex - 1;

    while (index >= 0) {
        const char = originalText[index];

        if (char === "\n") {
            newlineCount += 1;
            index -= 1;
            if (index >= 0 && originalText[index] === "\r") {
                index -= 1;
            }
            continue;
        }

        if (char === "\r") {
            newlineCount += 1;
            index -= 1;
            continue;
        }

        if (char === " " || char === "\t") {
            index -= 1;
            continue;
        }

        if (char === "/") {
            const decorativeLineStart = findDecorativeLineStart(originalText, index);
            if (decorativeLineStart !== null) {
                index = decorativeLineStart - 1;
                continue;
            }
        }

        break;
    }

    return newlineCount >= 2;
}

function hasSimpleLeadingBlankLineInSource(comment, originalText) {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return false;
    }

    const { startIndex } = sourceSpan;
    let newlineCount = 0;
    let index = startIndex - 1;

    while (index >= 0) {
        const char = originalText[index];

        if (char === "\n" || char === "\r") {
            newlineCount += 1;
            if (newlineCount >= 2) {
                return true;
            }
            index -= 1;
            continue;
        }

        if (char === " " || char === "\t") {
            index -= 1;
            continue;
        }

        return false;
    }

    return newlineCount >= 2;
}

function isMethodListTerminalCommentBeforeFunction(comment, originalText): boolean {
    if (typeof originalText !== "string") {
        return false;
    }

    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (sourceSpan === null) {
        return false;
    }

    const { endIndex } = sourceSpan;
    let cursor = endIndex + 1;
    while (cursor < originalText.length) {
        const char = originalText[cursor];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            cursor += 1;
            continue;
        }
        break;
    }

    return originalText.startsWith("function", cursor);
}

const DECORATIVE_LINE_CHARACTERS = new Set(["/", "-", "_", "~", "*", "#", "<", ">", "|", ":", "."]);

function findDecorativeLineStart(text, endIndex) {
    if (typeof text !== "string" || endIndex < 0) {
        return null;
    }

    let lineStart = endIndex;
    while (lineStart >= 0) {
        const char = text[lineStart];
        if (char === "\n" || char === "\r") {
            lineStart += 1;
            break;
        }
        lineStart -= 1;
    }

    if (lineStart < 0) {
        lineStart = 0;
    }

    for (let pos = lineStart; pos <= endIndex; pos += 1) {
        const char = text[pos];
        if (DECORATIVE_LINE_CHARACTERS.has(char) || char === " " || char === "\t" || char === "\r") {
            continue;
        }
        return null;
    }

    return lineStart;
}

function applyTrailingCommentPadding(comment) {
    if (!Core.isObjectLike(comment)) {
        return;
    }

    const isTrailingComment = Boolean(
        comment.trailing || comment.placement === "endOfLine" || comment._structPropertyTrailing
    );

    if (!isTrailingComment) {
        return;
    }

    const enumPadding = typeof comment._enumTrailingPadding === "number" ? comment._enumTrailingPadding : 0;

    const adjustedPadding = Math.max(enumPadding, 0);

    if (typeof comment.inlinePadding === "number") {
        comment.inlinePadding = Math.max(comment.inlinePadding, adjustedPadding);
    } else if (adjustedPadding > 0) {
        comment.inlinePadding = adjustedPadding;
    } else {
        comment.inlinePadding = 0;
    }
}

function hasInlineContentBeforeComment(comment, options) {
    if (!Core.isObjectLike(comment) || !options) {
        return false;
    }

    const sourceSpan = resolveCommentSourceSpan(comment, options.originalText);
    if (!sourceSpan || sourceSpan.startIndex <= 0) {
        return false;
    }

    const { originalText, startIndex } = sourceSpan;
    const lastLineBreak = originalText.lastIndexOf("\n", startIndex - 1);
    const lineStart = lastLineBreak === -1 ? 0 : lastLineBreak + 1;
    const precedingSegment = originalText.slice(lineStart, startIndex);
    return /\S/.test(precedingSegment.replaceAll("\r", ""));
}

function getNextNonWhitespaceCharacterAfterComment(comment, originalText) {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (!sourceSpan) {
        return null;
    }

    const { endIndex } = sourceSpan;
    for (let index = endIndex + 1; index < originalText.length; index += 1) {
        const char = originalText[index];
        if (char === "\n" || char === "\r" || char === " " || char === "\t") {
            continue;
        }
        return char;
    }

    return null;
}

function applyBottomCommentInlinePadding(comment, options) {
    if (
        !Core.isObjectLike(comment) ||
        comment.isBottomComment !== true ||
        !hasInlineContentBeforeComment(comment, options)
    ) {
        return;
    }

    const nextChar = getNextNonWhitespaceCharacterAfterComment(comment, options?.originalText);
    if (nextChar !== null) {
        return;
    }

    // Prettier already injects a single space between the preceding code and
    // the trailing comment doc, so only request one extra padding space here to
    // reach the two-space target that the fixtures expect.
    comment.inlinePadding = 1;
}

function collectDanglingComments(path, filter) {
    const node = path.getValue();
    if (!node?.comments) {
        return [];
    }

    const entries = [];
    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (Core.isCommentNode(comment) && !comment.leading && !comment.trailing && (!filter || filter(comment))) {
            entries.push({
                commentIndex: commentPath.getName(),
                comment
            });
        }
    }, "comments");

    return entries;
}

function printCommentAtIndex(path, options, commentIndex) {
    return path.call((commentPath) => printComment(commentPath, options), "comments", commentIndex);
}

function collectPrintedDanglingComments(path, options, filter) {
    return collectDanglingComments(path, filter).map(({ commentIndex, comment }) => ({
        comment,
        printed: printCommentAtIndex(path, options, commentIndex)
    }));
}

function printDanglingComments(path, options, filter) {
    const entries = collectPrintedDanglingComments(path, options, filter);

    if (entries.length === 0) {
        return "";
    }

    return entries.map(({ comment, printed }) => (comment.attachToBrace ? [" ", printed] : [printed]));
}

function printDanglingCommentsAsGroup(path, options, filter) {
    const entries = collectPrintedDanglingComments(path, options, filter);

    if (entries.length === 0) {
        return "";
    }

    return buildDanglingCommentGroupParts(entries);
}

function buildDanglingCommentGroupParts(entries) {
    const parts = [];
    const finalIndex = entries.length - 1;

    for (const [index, entry] of entries.entries()) {
        appendDanglingCommentGroupEntry(parts, entry, index, finalIndex);
    }

    return parts;
}

function appendDanglingCommentGroupEntry(parts, entry, index, finalIndex) {
    const { comment, printed } = entry;

    if (index === 0) {
        parts.push(whitespaceToDoc(normalizeDanglingGroupLeadingWhitespace(comment.leadingWS)));
    }

    parts.push([printed]);

    if (index !== finalIndex) {
        parts.push(resolveDanglingCommentSeparator(comment));
    }
}

function normalizeDanglingGroupLeadingWhitespace(text: unknown): string {
    if (typeof text !== "string") {
        return "";
    }

    return text.replace(/(\r?\n)[ \t]+$/, "$1");
}

function resolveDanglingCommentSeparator(comment) {
    if (isDecorativeBlockComment(comment)) {
        return hardline;
    }
    const separator = whitespaceToDoc(comment.trailingWS);
    return separator === "" ? " " : separator;
}

function handleCommentInEmptyBody(comment /*, text, options, ast, isLastComment */) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_BODY_TARGETS);
}

function handleDetachedOwnLineComment(comment /*, text, options, ast */) {
    const { precedingNode, followingNode } = comment;

    if (!precedingNode || !followingNode) {
        return false;
    }

    const commentLine = comment?.start?.line;
    const precedingEndLine = precedingNode?.end?.line;
    const followingStartLine = followingNode?.start?.line;

    if (!Number.isFinite(commentLine) || !Number.isFinite(precedingEndLine) || !Number.isFinite(followingStartLine)) {
        return false;
    }

    if (commentLine <= precedingEndLine) {
        return false;
    }

    if (commentLine >= followingStartLine) {
        return false;
    }

    addLeadingComment(followingNode, comment);
    comment.leading = true;
    comment.trailing = false;
    comment.placement = "ownLine";
    const leadingWhitespace = typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    if (!/[\r\n]/.test(leadingWhitespace)) {
        comment.leadingWS = "\n\n";
    } else if (!/[\r\n][\t ]*[\r\n]/.test(leadingWhitespace)) {
        comment.leadingWS = `${leadingWhitespace}\n`;
    }
    comment.trailingWS = "\n";
    return true;
}

function handleDecorativeBlockCommentOwnLine(comment, _text, _options, ast) {
    const text = _text;
    void _options;
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    const decorated = formatDecorativeBlockComment(comment, text);
    if (decorated === null) {
        return false;
    }

    extendDecorativeCommentEndAcrossSlashSuffix(comment, text);

    const followingNode = comment.followingNode ?? findFollowingNodeForComment(ast, comment);
    if (!followingNode) {
        return false;
    }

    const hadPrecedingNode = Boolean(comment.precedingNode);
    const shouldForceLeadingBlankLine = !hadPrecedingNode && comment.enclosingNode?.type === "Program";

    if (Array.isArray(followingNode.comments)) {
        const index = followingNode.comments.indexOf(comment);
        if (index !== -1) {
            followingNode.comments.splice(index, 1);
        }
    }
    addLeadingComment(followingNode, comment);
    if (comment.precedingNode && Array.isArray(comment.precedingNode.comments)) {
        const index = comment.precedingNode.comments.indexOf(comment);
        if (index !== -1) {
            comment.precedingNode.comments.splice(index, 1);
        }
    }
    if (comment.enclosingNode && Array.isArray(comment.enclosingNode.comments)) {
        const index = comment.enclosingNode.comments.indexOf(comment);
        if (index !== -1) {
            comment.enclosingNode.comments.splice(index, 1);
        }
    }
    comment.precedingNode = null;
    comment.followingNode = followingNode;
    comment.leading = true;
    comment.trailing = false;
    comment.placement = "ownLine";
    comment._gmlForceLeadingBlankLine = shouldForceLeadingBlankLine;
    const leadingWhitespace = typeof comment.leadingWS === "string" ? comment.leadingWS : "";

    if (shouldForceLeadingBlankLine && !/\r|\n/.test(leadingWhitespace)) {
        comment.leadingWS = "\n";
    }
    comment.trailingWS = shouldForceLeadingBlankLine ? "\n" : "";
    return true;
}

function extendDecorativeCommentEndAcrossSlashSuffix(comment, text) {
    if (typeof text !== "string") {
        return;
    }

    const endIndex = getCommentEndIndex(comment);
    if (!Number.isInteger(endIndex) || endIndex < 0 || endIndex >= text.length - 1) {
        return;
    }

    let cursor = endIndex + 1;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) {
        cursor += 1;
    }

    const suffixStart = cursor;

    while (cursor < text.length) {
        const char = text[cursor];
        if (char === "\n" || char === "\r") {
            break;
        }

        if (char !== "/" && char !== "*") {
            return;
        }

        cursor += 1;
    }

    if (cursor <= suffixStart) {
        return;
    }

    const suffix = text.slice(suffixStart, cursor);
    if (!suffix.includes("/")) {
        return;
    }

    const extendedEndIndex = cursor - 1;
    if (typeof comment.end === "number") {
        comment.end = extendedEndIndex;
        return;
    }

    if (
        typeof comment.end === "object" &&
        comment.end !== null &&
        "index" in comment.end &&
        typeof comment.end.index === "number"
    ) {
        const location = comment.end as { index: number; column?: number };
        const originalIndex = location.index;
        location.index = extendedEndIndex;
        if (typeof location.column === "number") {
            location.column += extendedEndIndex - originalIndex;
        }
    }
}

function findFollowingNodeForComment(ast, comment) {
    const commentEndIndex = getCommentEndIndex(comment);
    if (!Number.isFinite(commentEndIndex)) {
        return null;
    }

    const visited = new WeakSet();
    const stack = [ast];
    let candidate = null;
    let candidateStart = Infinity;

    while (stack.length > 0) {
        const node = stack.pop();
        if (!isObjectLike(node)) {
            continue;
        }

        if (visited.has(node)) {
            continue;
        }
        visited.add(node);

        if (Core.isNode(node) && !Core.isCommentNode(node)) {
            const startIndex = Core.getNodeStartIndex(node);
            if (typeof startIndex === "number" && startIndex > commentEndIndex && startIndex < candidateStart) {
                candidate = node;
                candidateStart = startIndex;
            }
        }

        // Use for...in instead of Object.entries to avoid allocating intermediate
        // [key, value] tuple arrays on every visited node. Benchmarked at ~16% faster
        // in AST traversals. Mirrors the optimization in collectCommentNodes
        // (src/core/src/comments/comment-utils.ts).
        for (const key in node) {
            if (!Object.hasOwn(node, key)) {
                continue;
            }

            if (key === "comments" || key === "docComments") {
                continue;
            }

            const value = node[key];
            pushChildrenToStack(stack, value);
        }
    }

    return candidate;
}

function pushChildrenToStack(stack, value) {
    if (value && typeof value === "object") {
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (entry && typeof entry === "object") {
                    stack.push(entry);
                }
            }
        } else {
            stack.push(value);
        }
    }
}

function getCommentEndIndex(comment) {
    const end = comment?.end;
    if (typeof end === "number") {
        return end;
    }

    if (end && typeof end.index === "number") {
        return end.index;
    }

    return null;
}

function handleMacroComments(comment) {
    if (comment.enclosingNode?.type === "MacroDeclaration") {
        comment.printed = true;
        return true;
    }
    return false;
}

function isDecorativeBlockComment(comment) {
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    const value = typeof comment.value === "string" ? comment.value : null;
    if (value === null) {
        return false;
    }

    return hasDecorativeSlashBanner(value);
}

function handleCommentAttachedToOpenBrace(comment, _text, _options, ast /*, isLastComment */) {
    void _text;
    void _options;
    let enclosingNode = comment.enclosingNode;

    if (!enclosingNode && comment?.leadingChar === "{") {
        enclosingNode = findBraceOwnerForComment(ast, comment);
        if (enclosingNode) {
            comment.enclosingNode = enclosingNode;
        }
    }

    if (!isBlockStatement(enclosingNode) && enclosingNode?.type !== "SwitchStatement") {
        return false;
    }

    const isCommentImmediatelyAfterOpeningBrace = comment?.leadingChar === "{";
    if (!isCommentOnNodeStartLine(comment, enclosingNode) && !isCommentImmediatelyAfterOpeningBrace) {
        return false;
    }

    comment.attachToBrace = true;
    addDanglingComment(enclosingNode, comment, false);
    return true;
}

function handleClauseBlockIntroComment(comment, _text, _options, _ast /*, isLastComment */) {
    void _text;
    void _options;
    void _ast;
    const { enclosingNode, precedingNode, followingNode } = comment;
    if (!enclosingNode || !followingNode) {
        return false;
    }

    const clauseConfig = resolveClauseCommentConfig(enclosingNode);
    if (!clauseConfig) {
        return false;
    }

    const clauseNode = enclosingNode[clauseConfig.clauseKey];
    const bodyNode = enclosingNode[clauseConfig.bodyKey];
    if (bodyNode !== followingNode) {
        return false;
    }

    if (clauseNode !== precedingNode) {
        return false;
    }

    if (clauseNode?.type !== "ParenthesizedExpression") {
        return false;
    }

    if (!isCommentOnNodeEndLine(comment, clauseNode)) {
        return false;
    }

    if (bodyNode?.type === "BlockStatement") {
        comment.attachToBrace = true;
        addDanglingComment(bodyNode, comment, false);
    } else {
        comment.attachToClauseBody = true;
        addDanglingComment(enclosingNode, comment, false);
    }

    if (typeof comment.leadingWS === "string") {
        comment.leadingWS = comment.leadingWS.replaceAll("\t", "    ");
    }

    comment.leading = false;
    comment.trailing = false;
    delete comment.placement;
    return true;
}

function resolveClauseCommentConfig(node) {
    switch (node?.type) {
        case "IfStatement": {
            return { clauseKey: "test", bodyKey: "consequent" };
        }
        case "WhileStatement":
        case "RepeatStatement":
        case "WithStatement": {
            return { clauseKey: "test", bodyKey: "body" };
        }
        default: {
            return null;
        }
    }
}

function isBlockStatement(node) {
    return node?.type === "BlockStatement";
}

function findBraceOwnerForComment(ast, comment) {
    if (!ast || !comment) {
        return null;
    }

    const { index: commentIndex, line: commentLine } = getLocationMetadata(comment.start);

    if (!Number.isFinite(commentIndex) || !Number.isFinite(commentLine)) {
        return null;
    }

    let match = null;
    const stack = [ast];
    const seen = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!isObjectLike(node) || seen.has(node)) {
            continue;
        }

        seen.add(node);

        if (!node.type) {
            continue;
        }

        const { index: startIndex, line: startLine } = getLocationMetadata(node.start);
        const { index: endIndex } = getLocationMetadata(node.end);

        if (
            Number.isFinite(startIndex) &&
            Number.isFinite(endIndex) &&
            commentIndex >= startIndex &&
            commentIndex <= endIndex &&
            commentLine === startLine &&
            node.type === "SwitchStatement" &&
            (!match || getLocationMetadata(match.start).index <= startIndex)
        ) {
            match = node;
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                pushTypedEntries(stack, value);
                continue;
            }

            if (hasTypeProperty(value) && value.type && value.type !== "CommentBlock" && value.type !== "CommentLine") {
                stack.push(value);
            }
        }
    }

    return match;
}

function pushTypedEntries(stack: Array<any>, entries: Array<unknown>): void {
    for (const entry of entries) {
        if (hasTypeProperty(entry) && entry.type) {
            stack.push(entry);
        }
    }
}

function getLocationMetadata(position) {
    if (position == null) {
        return { index: Number.NaN, line: Number.NaN };
    }

    if (typeof position === "number") {
        return { index: position, line: Number.NaN };
    }

    const index = typeof position.index === "number" ? position.index : Number.NaN;
    const line = typeof position.line === "number" ? position.line : Number.NaN;

    return { index, line };
}

function isCommentOnNodeLine(comment, node, getNodeLine) {
    const commentLine = comment.start?.line;
    const nodeLine = getNodeLine(node);

    const isCommentLineMissing = commentLine == null;
    const isNodeLineMissing = nodeLine == null;

    if (isCommentLineMissing || isNodeLineMissing) {
        return false;
    }

    return commentLine === nodeLine;
}

function isCommentOnNodeStartLine(comment, node) {
    return isCommentOnNodeLine(comment, node, (target) => target?.start?.line);
}

function isCommentOnNodeEndLine(comment, node) {
    return isCommentOnNodeLine(comment, node, (target) => target?.end?.line);
}

function handleCommentInEmptyParens(comment /*, text, options, ast, isLastComment */) {
    if (comment.leadingChar !== "(" || comment.trailingChar !== ")") {
        return false;
    }

    return attachDanglingCommentToEmptyNode(comment, EMPTY_PARENS_TARGETS);
}

function handleCommentInEmptyLiteral(comment /*, text, options, ast, isLastComment */) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_LITERAL_TARGETS);
}

function handleOnlyComments(comment, options, ast /*, isLastComment */) {
    if (attachDocCommentToFollowingNode(comment, options, ast)) {
        return true;
    }

    const emptyProgram = findEmptyProgramTarget(ast, comment.enclosingNode, comment.followingNode);
    if (emptyProgram) {
        addDanglingComment(emptyProgram, comment, false);
        return true;
    }

    return false;
}

function attachDocCommentToFollowingNode(comment, options, ast) {
    if (comment?._gmlAttachedDocComment === true) {
        comment.printed = true;
        return true;
    }

    const immediateFollowingNode = resolveFollowingNonCommentNode(comment);
    const followingNode =
        isDocCommentTargetNode(immediateFollowingNode) || !ast
            ? immediateFollowingNode
            : findFollowingNodeForComment(ast, comment);

    if (!isDocCommentCandidate(comment, followingNode)) {
        return false;
    }
    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formatted = formatDocLikeLineComment(comment, lineCommentOptions, options?.originalText);
    const rawText = Core.getLineCommentRawText(comment, {
        originalText: options?.originalText
    });
    const shouldAttachTripleSlashContinuation = shouldAttachDocTripleSlashContinuation(comment, rawText, options);
    const shouldAttachLegacyLineDocTag = shouldAttachLegacyLineDocTagComment(rawText);
    const shouldAttachBlockDocTag = shouldAttachBlockDocTagComment(comment);

    const shouldAttachAsDocComment =
        (formatted && formatted.trimStart().startsWith("///")) ||
        shouldAttachTripleSlashContinuation ||
        shouldAttachLegacyLineDocTag ||
        shouldAttachBlockDocTag;

    if (!shouldAttachAsDocComment) {
        return false;
    }

    if (!followingNode.docComments) {
        followingNode.docComments = [];
    }

    if (shouldAttachBlockDocTag) {
        comment._gmlDocText = resolveRawBlockCommentText(comment, options?.originalText);
    }

    followingNode.docComments.push(comment);
    comment._gmlAttachedDocComment = true;
    comment.printed = true;
    return true;
}

function shouldAttachLegacyLineDocTagComment(rawText: string | null): boolean {
    if (typeof rawText !== "string") {
        return false;
    }

    return LEGACY_LINE_DOC_TAG_PATTERN.test(rawText);
}

function shouldAttachBlockDocTagComment(comment: PrinterComment): boolean {
    if (comment?.type !== "CommentBlock" || typeof comment.value !== "string") {
        return false;
    }

    return BLOCK_DOC_TAG_PATTERN.test(comment.value.trimStart());
}

function resolveRawBlockCommentText(comment: PrinterComment, originalText: string | null | undefined): string {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (sourceSpan !== null) {
        return sourceSpan.originalText.slice(sourceSpan.startIndex, sourceSpan.endIndex + 1);
    }

    const value = typeof comment.value === "string" ? comment.value : "";
    return `/*${value}*/`;
}

function shouldAttachDocTripleSlashContinuation(comment, rawText, options) {
    void comment;
    void options;
    if (!/^\s*\/\/\//.test(rawText)) {
        return false;
    }

    if (/^\s*\/\/\/\s*$/.test(rawText)) {
        return false;
    }

    if (/^\s*\/\/\/\s*\./.test(rawText)) {
        return false;
    }

    return true;
}

function isDocCommentCandidate(comment, followingNode) {
    if (comment.type !== "CommentLine" && comment.type !== "CommentBlock") {
        return false;
    }

    return isDocCommentTargetNode(followingNode);
}

function isFunctionLikeDocInitializer(node: unknown): boolean {
    if (!isObjectLike(node)) {
        return false;
    }

    const nodeRecord = node as Record<string, unknown>;
    const initializerType = nodeRecord.type;
    if (
        initializerType === "FunctionDeclaration" ||
        initializerType === "FunctionExpression" ||
        initializerType === "ConstructorDeclaration"
    ) {
        return true;
    }

    if (initializerType === "ParenthesizedExpression") {
        return isFunctionLikeDocInitializer(nodeRecord.expression);
    }

    return false;
}

function isFunctionInitializedVariableDeclaration(node: unknown): boolean {
    if (!isObjectLike(node)) {
        return false;
    }

    const nodeRecord = node as Record<string, unknown>;
    if (nodeRecord.type !== "VariableDeclaration") {
        return false;
    }

    const declarations = nodeRecord.declarations;
    if (!Array.isArray(declarations) || declarations.length !== 1) {
        return false;
    }

    const declarator = declarations[0];
    if (!isObjectLike(declarator)) {
        return false;
    }

    const declaratorRecord = declarator as Record<string, unknown>;
    if (declaratorRecord.type !== "VariableDeclarator") {
        return false;
    }

    return isFunctionLikeDocInitializer(declaratorRecord.init);
}

function isDocCommentTargetNode(node) {
    if (!isObjectLike(node)) {
        return false;
    }

    const nodeType = Reflect.get(node, "type");
    return nodeType === "FunctionDeclaration" || nodeType === "ConstructorDeclaration"
        ? true
        : isFunctionInitializedVariableDeclaration(node);
}

function resolveFollowingNonCommentNode(comment) {
    let candidate = comment?.followingNode ?? null;

    while (Core.isCommentNode(candidate) && isObjectLike(candidate) && "followingNode" in candidate) {
        const nextCandidate = candidate.followingNode;
        if (!nextCandidate || nextCandidate === candidate) {
            break;
        }
        candidate = nextCandidate;
    }

    return candidate;
}

function hasEmptyBody(candidate) {
    return Array.isArray(candidate?.body) && candidate.body.length === 0;
}

function isEmptyProgramNode(candidate) {
    return candidate?.type === "Program" && hasEmptyBody(candidate);
}

function findEmptyProgramTarget(ast, enclosingNode, followingNode) {
    if (hasEmptyBody(ast)) {
        return ast;
    }

    if (isEmptyProgramNode(enclosingNode)) {
        return enclosingNode;
    }

    if (isEmptyProgramNode(followingNode)) {
        return followingNode;
    }

    return null;
}

function formatDecorativeBlockComment(comment, originalText) {
    const value = typeof comment?.value === "string" ? comment.value : null;
    if (value === null) {
        return null;
    }

    const lines = value.split(/\r?\n/);
    if (containsCommentedOutCodeLines(lines)) {
        return null;
    }
    const significantLines = lines.filter((line) => Core.isNonEmptyTrimmedString(line));
    if (significantLines.length === 0) {
        return null;
    }

    if (!hasDecorativeSlashBanner(value)) {
        return null;
    }

    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (sourceSpan !== null) {
        const sourceCommentText = sourceSpan.originalText.slice(sourceSpan.startIndex, sourceSpan.endIndex + 1);
        return normalizeDecorativeCommentSourceIndentation(sourceCommentText, comment);
    }

    return `/*${value}*/`;
}

function normalizeDecorativeCommentSourceIndentation(sourceCommentText: string, comment: PrinterComment): string {
    const lines = sourceCommentText.split(/\r?\n/).map((line) => line.replaceAll("\t", "    "));
    if (lines.length === 0) {
        return sourceCommentText;
    }

    const nonEmptyLines = lines.map((line, index) => ({ index, line })).filter(({ line }) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) {
        return lines.join("\n");
    }

    const desiredIndentation = resolveDecorativeCommentTargetIndentation(comment);
    const firstNonEmptyIndex = nonEmptyLines[0]?.index ?? -1;
    const lastNonEmptyIndex = nonEmptyLines.at(-1)?.index ?? -1;

    if (firstNonEmptyIndex < 0 || lastNonEmptyIndex < 0) {
        return lines.join("\n");
    }

    const openingLine = lines[firstNonEmptyIndex] ?? "";
    const openingIndentation = openingLine.length - openingLine.trimStart().length;
    const openingDedent = Math.max(0, openingIndentation - desiredIndentation);

    let minimumInteriorIndentation: number | null = null;
    for (let lineIndex = firstNonEmptyIndex + 1; lineIndex < lastNonEmptyIndex; lineIndex += 1) {
        const interiorLine = lines[lineIndex] ?? "";
        if (interiorLine.trim().length === 0) {
            continue;
        }

        const interiorIndentation = interiorLine.length - interiorLine.trimStart().length;
        if (minimumInteriorIndentation === null || interiorIndentation < minimumInteriorIndentation) {
            minimumInteriorIndentation = interiorIndentation;
        }
    }

    const desiredInteriorIndentation = desiredIndentation + 4;
    const interiorDedent =
        minimumInteriorIndentation === null
            ? openingDedent
            : Math.max(0, minimumInteriorIndentation - desiredInteriorIndentation);

    const normalizedLines = lines.map((line, lineIndex) => {
        if (line.trim().length === 0) {
            return "";
        }

        if (lineIndex === firstNonEmptyIndex) {
            return line.slice(Math.min(openingDedent, line.length));
        }

        if (lineIndex > firstNonEmptyIndex && lineIndex < lastNonEmptyIndex) {
            const trimmedLine = line.trimStart();
            const contentIndentation = line.length - trimmedLine.length;
            const dedentedContentIndentation = Math.max(0, contentIndentation - interiorDedent);
            const targetIndentation = Math.max(desiredInteriorIndentation, dedentedContentIndentation);
            return `${" ".repeat(targetIndentation)}${trimmedLine}`;
        }

        return line.slice(Math.min(openingDedent, line.length));
    });

    const closingIndex = normalizedLines.findLastIndex((line) => line.trim().length > 0);
    if (closingIndex !== -1 && /^\s*\*\/{10,}\s*$/.test(normalizedLines[closingIndex])) {
        normalizedLines[closingIndex] = normalizedLines[closingIndex].trimStart();
    }

    return normalizedLines.join("\n");
}

function resolveDecorativeCommentTargetIndentation(comment: PrinterComment): number {
    const followingColumn = comment?.followingNode?.start?.column;
    if (typeof followingColumn === "number" && Number.isFinite(followingColumn)) {
        return Math.max(0, followingColumn);
    }

    const precedingColumn = comment?.precedingNode?.start?.column;
    if (typeof precedingColumn === "number" && Number.isFinite(precedingColumn)) {
        return Math.max(0, precedingColumn);
    }

    if (comment?.enclosingNode?.type === "Program") {
        return 0;
    }

    return 0;
}

function formatCanonicalTopLevelBlockComment(comment, originalText): string | null {
    const value = typeof comment?.value === "string" ? comment.value : null;
    if (value === null) {
        return null;
    }

    if (hasAdjacentBlockCommentInSource(comment, originalText)) {
        return null;
    }

    const lines = value.split(/\r?\n/).map((line) => line.replaceAll("\t", "    "));
    if (lines.length <= 1 || containsCommentedOutCodeLines(lines)) {
        return null;
    }

    const leadingWhitespace = typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    const newlineIndex = Math.max(leadingWhitespace.lastIndexOf("\n"), leadingWhitespace.lastIndexOf("\r"));
    const indentationFragment = newlineIndex === -1 ? leadingWhitespace : leadingWhitespace.slice(newlineIndex + 1);
    const isTopLevel = leadingWhitespace === "" || indentationFragment.length === 0;

    if (!isTopLevel) {
        return null;
    }

    const significantLines = lines.filter((line) => Core.isNonEmptyTrimmedString(line));
    const textLines = significantLines.map((line) => line.trim());
    if (textLines.length === 0) {
        return null;
    }
    if (textLines.length === 1) {
        return null;
    }

    if (isCanonicalTopLevelDocBlockComment(comment, originalText)) {
        const docBlockTextLines = normalizeCanonicalDocBlockTextLines(significantLines);
        if (docBlockTextLines !== null) {
            return ["/**", ...docBlockTextLines.map(formatCanonicalDocBlockTextLine), " */"].join("\n");
        }
    }

    const interiorLines = lines.slice(1, -1);
    const hasInteriorBlankLines = interiorLines.some((line) => line.trim().length === 0);
    if (!hasInteriorBlankLines) {
        const sourceSpan = resolveCommentSourceSpan(comment, originalText);
        if (sourceSpan !== null) {
            return sourceSpan.originalText.slice(sourceSpan.startIndex, sourceSpan.endIndex + 1);
        }

        return `/*${value}*/`;
    }

    return ["/*", ...textLines.map((line) => ` * ${line}`), " */"].join("\n");
}

function isCanonicalTopLevelDocBlockComment(comment, originalText): boolean {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (sourceSpan === null) {
        return false;
    }

    const { startIndex } = sourceSpan;
    return originalText.startsWith("/**", startIndex);
}

function normalizeCanonicalDocBlockTextLines(lines: string[]): string[] | null {
    const normalizedLines = [];

    for (const line of lines) {
        const trimmedStartLine = line.trimStart();
        if (!trimmedStartLine.startsWith("*")) {
            return null;
        }

        normalizedLines.push(trimmedStartLine.slice(1).trim());
    }

    if (normalizedLines.length > 1 && normalizedLines[0] === "") {
        normalizedLines.shift();
    }

    return normalizedLines;
}

function formatCanonicalDocBlockTextLine(line: string): string {
    return line.length === 0 ? " *" : ` * ${line}`;
}

function hasAdjacentBlockCommentInSource(comment, originalText): boolean {
    const sourceSpan = resolveCommentSourceSpan(comment, originalText);
    if (sourceSpan === null) {
        return false;
    }

    const { startIndex, endIndex } = sourceSpan;
    const previousNonWhitespaceIndex = findPreviousNonWhitespaceIndex(originalText, startIndex - 1);
    if (
        previousNonWhitespaceIndex >= 1 &&
        originalText[previousNonWhitespaceIndex] === "/" &&
        originalText[previousNonWhitespaceIndex - 1] === "*"
    ) {
        return true;
    }

    const nextNonWhitespaceIndex = findNextNonWhitespaceIndex(originalText, endIndex + 1);
    if (
        nextNonWhitespaceIndex >= 0 &&
        nextNonWhitespaceIndex + 1 < originalText.length &&
        originalText[nextNonWhitespaceIndex] === "/" &&
        originalText[nextNonWhitespaceIndex + 1] === "*"
    ) {
        return true;
    }

    return false;
}

function findPreviousNonWhitespaceIndex(text: string, startIndex: number): number {
    for (let index = startIndex; index >= 0; index -= 1) {
        const char = text[index];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            continue;
        }
        return index;
    }

    return -1;
}

function findNextNonWhitespaceIndex(text: string, startIndex: number): number {
    for (let index = startIndex; index < text.length; index += 1) {
        const char = text[index];
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            continue;
        }
        return index;
    }

    return -1;
}

function formatNonDecorativeBlockComment(comment): string {
    const normalizedValue = normalizeNonDecorativeBlockCommentValue(comment?.value);
    const hasMultipleLines = normalizedValue.includes("\n");

    if (!hasMultipleLines) {
        return `/*${normalizedValue}*/`;
    }

    const openingIndentation = resolveCommentLineIndentation(comment);
    const minimumInteriorIndentation = openingIndentation + 4;
    const normalizedInterior = normalizeNonDecorativeMultilineBlockCommentIndentation(
        normalizedValue,
        minimumInteriorIndentation
    );

    return `/*${normalizedInterior}*/`;
}

function resolveCommentLineIndentation(comment): number {
    const leadingWhitespace = typeof comment?.leadingWS === "string" ? comment.leadingWS : "";
    const newlineIndex = Math.max(leadingWhitespace.lastIndexOf("\n"), leadingWhitespace.lastIndexOf("\r"));
    const indentationFragment = newlineIndex === -1 ? leadingWhitespace : leadingWhitespace.slice(newlineIndex + 1);
    return indentationFragment.replaceAll("\t", "    ").length;
}

function normalizeNonDecorativeMultilineBlockCommentIndentation(
    value: string,
    minimumInteriorIndentation: number
): string {
    const lines = value.split(/\r?\n/);
    if (lines.length <= 2) {
        return value;
    }

    for (let index = 1; index < lines.length - 1; index += 1) {
        const currentLine = lines[index];
        const currentLineWithSpaces = currentLine.replaceAll("\t", "    ");
        const trimmedLine = currentLineWithSpaces.trimStart();
        if (trimmedLine.length === 0) {
            continue;
        }

        const leadingWhitespaceLength = currentLineWithSpaces.length - trimmedLine.length;
        if (leadingWhitespaceLength >= minimumInteriorIndentation) {
            lines[index] = currentLineWithSpaces;
            continue;
        }

        lines[index] = `${" ".repeat(minimumInteriorIndentation)}${trimmedLine}`;
    }

    return lines.join("\n");
}

function normalizeNonDecorativeBlockCommentValue(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }

    if (!value.includes("\t")) {
        return value;
    }

    return value.replaceAll("\t", "    ");
}

function collapseSuppressedTripleSlashSeparatorWhitespace(comment) {
    const precedingNode = comment?.precedingNode;
    const followingNode = comment?.followingNode;

    if (Core.isCommentNode(precedingNode)) {
        precedingNode.trailingWS = "\n";
    }

    if (Core.isCommentNode(followingNode)) {
        followingNode.leadingWS = "";
    }
}

function hasDecorativeSlashBanner(commentValue: string): boolean {
    const lines = commentValue.split(/\r?\n/);
    let hasDecorativeLine = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) {
            continue;
        }

        if (DECORATIVE_SLASH_LINE_PATTERN.test(trimmedLine)) {
            hasDecorativeLine = true;
        }
    }

    return hasDecorativeLine;
}

function containsCommentedOutCodeLines(lines) {
    const codeDetectionPatterns = Core.DEFAULT_COMMENTED_OUT_CODE_PATTERNS;

    for (const line of lines) {
        const trimmed = line.trimStart();
        const content = normalizeCommentedCodeCandidate(trimmed);
        if (content === "") {
            continue;
        }

        if (/^\/+$/.test(content)) {
            continue;
        }

        for (const pattern of codeDetectionPatterns) {
            pattern.lastIndex = 0;
            if (pattern.test(content)) {
                return true;
            }
        }
    }

    return false;
}

function normalizeCommentedCodeCandidate(trimmedLine) {
    if (trimmedLine.startsWith("//")) {
        return trimmedLine.slice(2).trim();
    }

    if (trimmedLine.startsWith("*")) {
        return trimmedLine.slice(1).trim();
    }

    return trimmedLine.trim();
}

function formatCommentedOutCodeBlockComment(comment) {
    const value = typeof comment?.value === "string" ? comment.value : null;
    if (value === null) {
        return null;
    }

    if (!containsCommentedOutCodeLines(value.split(/\r?\n/))) {
        return null;
    }

    const normalized = value.replace(/^(?:\r?\n){2}([ \t]*\/\/)/, "\n$1");
    return `/*${normalized}*/`;
}

function whitespaceToDoc(text) {
    const lineBreakCount = Core.getLineBreakCount(text);
    if (lineBreakCount === 0) {
        return text;
    }

    const lines = Core.splitLines(text);
    return join(hardline, lines);
}

export { handleComments, printComment, printDanglingComments, printDanglingCommentsAsGroup };

/** @internal Test-only surface. Do not import in production code. */
export const __test__ = { DECORATIVE_SLASH_LINE_PATTERN };
