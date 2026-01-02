// Comment handling helpers relocated to the plugin so Prettier can format comments directly.

import { util } from "prettier";
import { builders } from "prettier/doc";
import { Core } from "@gml-modules/core";
import { isFunctionDocCommentLine } from "../doc-comment/function-tag-filter.js";
import { normalizeDocLikeLineComment } from "./doc-like-line-normalization.js";
import { countTrailingBlankLines } from "../printer/semicolons.js";

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
        const isEmptyArray =
            Array.isArray(collection) && collection.length === 0;
        const isCollectionMissing = collection == null;
        if (isEmptyArray || isCollectionMissing) {
            addDanglingComment(node, comment, false);
            return true;
        }
    }

    return false;
}

function handleHoistedDeclarationLeadingComment(comment: PrinterComment) {
    const target = comment?._featherHoistedTarget;

    if (!target) {
        return false;
    }

    addLeadingComment(target, comment);
    delete comment._featherHoistedTarget;

    return true;
}

const OWN_LINE_COMMENT_HANDLERS = [
    handleDecorativeBlockCommentOwnLine,
    handleHoistedDeclarationLeadingComment,
    handleCommentInEmptyBody,
    handleCommentInEmptyParens,
    handleOnlyComments
];

const COMMON_COMMENT_HANDLERS = [
    handleHoistedDeclarationLeadingComment,
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

function runCommentHandlers(
    handlers,
    comment,
    text,
    options,
    ast,
    isLastComment
) {
    for (const handler of handlers) {
        if (handler(comment, text, options, ast, isLastComment)) {
            return true;
        }
    }

    return false;
}

function shouldSuppressComment(comment, options) {
    if (comment.type !== "CommentLine") {
        return false;
    }
    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formattingOptions = {
        ...lineCommentOptions,
        originalText: options.originalText
    };
    const formatted = Core.formatLineComment(comment, formattingOptions);
    if (isFunctionDocCommentLine(formatted)) {
        return true;
    }
    return formatted === null || formatted === "";
}

function suppressFormattedComment(comment, options) {
    if (!shouldSuppressComment(comment, options)) {
        return false;
    }

    comment.printed = true;
    return true;
}

const handleComments = {
    ownLine(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(
            OWN_LINE_COMMENT_HANDLERS,
            comment,
            text,
            options,
            ast,
            isLastComment
        );
    },
    endOfLine(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(
            END_OF_LINE_COMMENT_HANDLERS,
            comment,
            text,
            options,
            ast,
            isLastComment
        );
    },
    remaining(comment, text, options, ast, isLastComment) {
        if (suppressFormattedComment(comment, options)) {
            return true;
        }
        return runCommentHandlers(
            REMAINING_COMMENT_HANDLERS,
            comment,
            text,
            options,
            ast,
            isLastComment
        );
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

    applyTrailingCommentPadding(comment, options);
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
            const decorated = formatDecorativeBlockComment(comment.value);
            if (decorated !== null) {
                if (decorated === "") {
                    return "";
                }
                if (typeof comment.inlinePadding === "number") {
                    comment.inlinePadding = 0;
                }
                comment.trailingWS = "\n";

                const endIndex =
                    comment.end && typeof comment.end.index === "number"
                        ? comment.end.index
                        : comment.end;
                const blankLines = countTrailingBlankLines(
                    options.originalText,
                    endIndex + 1
                );

                if (comment.value.includes("Orthogonalize")) {
                    console.log(
                        `DEBUG: printComment Orthogonalize blankLines=${blankLines} endIndex=${endIndex}`
                    );
                    console.log(
                        `DEBUG: originalText slice: "${options.originalText
                            .slice(endIndex, endIndex + 10)
                            .replace(/\n/g, "\\n")}"`
                    );
                    console.log(
                        `DEBUG: comment start=${JSON.stringify(
                            comment.start
                        )}`
                    );
                }

                const shouldPrependBlankLine =
                    hasLeadingBlankLine(comment) ||
                    hasLeadingBlankLineInSource(
                        comment,
                        options?.originalText
                    );
                const parts = [];
                if (shouldPrependBlankLine) {
                    parts.push(hardline);
                }

                parts.push(decorated);
                if (blankLines > 0) {
                    parts.push(hardline, hardline);
                } else {
                    parts.push(hardline);
                }

                return parts;
            }
            return `/*${comment.value}*/`;
        }
        case "CommentLine": {
            const lineCommentOptions = Core.resolveLineCommentOptions(options);
            const formattingOptions = {
                ...lineCommentOptions,
                originalText: options.originalText
            };
            const formatted = Core.formatLineComment(
                comment,
                formattingOptions
            );
            const normalized =
                typeof formatted === "string"
                    ? normalizeDocLikeLineComment(comment, formatted)
                    : "";
            if (normalized.trim() === "/// @description") {
                return "";
            }
            const shouldPrependBlankLine =
                comment._featherForceLeadingBlankLine === true ||
                hasLeadingBlankLine(comment);
            if (shouldPrependBlankLine) {
                return [hardline, normalized];
            }
            return normalized;
        }
        default: {
            throw new Error(`Unknown comment type: ${comment.type}`);
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

    const originalText = options.originalText;
    if (typeof originalText !== "string") {
        return;
    }

    const startIndex = getCommentStartIndex(comment);
    if (!Number.isInteger(startIndex) || startIndex <= 0) {
        return;
    }

    const precedingChar = originalText[startIndex - 1];
    if (precedingChar !== " ") {
        return;
    }

    const beforePrecedingIndex = startIndex - 2;
    const beforePrecedingChar =
        beforePrecedingIndex >= 0 ? originalText[beforePrecedingIndex] : "\n";

    if (beforePrecedingChar !== "\n" && beforePrecedingChar !== "\r") {
        return;
    }

    comment.inlinePadding =
        typeof comment.inlinePadding === "number"
            ? Math.max(comment.inlinePadding, 1)
            : 1;
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

function getCommentLine(comment) {
    const start = comment?.start;
    if (typeof start === "number") {
        return Number.NaN;
    }

    if (start && typeof start.line === "number") {
        return start.line;
    }

    return Number.NaN;
}

function getNodeEndLine(node) {
    if (!node) {
        return Number.NaN;
    }

    const end = node.end;
    if (end && typeof end === "object" && typeof end.line === "number") {
        return end.line;
    }

    return Number.NaN;
}

function hasLeadingBlankLine(comment) {
    const leadingWhitespace =
        typeof comment?.leadingWS === "string" ? comment.leadingWS : "";
    if (/\n[\t ]*\n/.test(leadingWhitespace)) {
        return true;
    }

    const commentLine = getCommentLine(comment);
    if (!Number.isFinite(commentLine)) {
        return false;
    }

    const precedingEndLine = getNodeEndLine(comment?.precedingNode);
    if (!Number.isFinite(precedingEndLine)) {
        return false;
    }

    return commentLine >= precedingEndLine + 2;
}

function hasLeadingBlankLineInSource(comment, originalText) {
    if (!Core.isObjectLike(comment)) {
        return false;
    }

    const startIndex = getCommentStartIndex(comment);
    if (!Number.isInteger(startIndex)) {
        return false;
    }

    if (typeof originalText !== "string") {
        return false;
    }

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

        break;
    }

    return newlineCount >= 2;
}

function applyTrailingCommentPadding(comment, options) {
    if (!Core.isObjectLike(comment)) {
        return;
    }

    if (comment._featherPreserveTrailingPadding) {
        return;
    }

    const isTrailingComment = Boolean(
        comment.trailing ||
            comment.placement === "endOfLine" ||
            comment._structPropertyTrailing
    );

    if (!isTrailingComment) {
        return;
    }

    const originalText = options.originalText;
    const enumPadding =
        typeof comment._enumTrailingPadding === "number"
            ? comment._enumTrailingPadding
            : 0;

    const adjustedPadding = Math.max(enumPadding, 0);

    if (typeof comment.inlinePadding === "number") {
        comment.inlinePadding = Math.max(
            comment.inlinePadding,
            adjustedPadding
        );
    } else if (adjustedPadding > 0) {
        comment.inlinePadding = adjustedPadding;
    } else {
        comment.inlinePadding = 0;
    }
}

function collectDanglingComments(path, filter) {
    const node = path.getValue();
    if (!node?.comments) {
        return [];
    }

    const entries = [];
    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (
            Core.isCommentNode(comment) &&
            !comment.leading &&
            !comment.trailing &&
            (!filter || filter(comment))
        ) {
            entries.push({
                commentIndex: commentPath.getName(),
                comment
            });
        }
    }, "comments");

    return entries;
}

function printCommentAtIndex(path, options, commentIndex) {
    return path.call(
        (commentPath) => printComment(commentPath, options),
        "comments",
        commentIndex
    );
}

function collectPrintedDanglingComments(path, options, filter) {
    return collectDanglingComments(path, filter).map(
        ({ commentIndex, comment }) => ({
            comment,
            printed: printCommentAtIndex(path, options, commentIndex)
        })
    );
}

function printDanglingComments(path, options, filter) {
    const entries = collectPrintedDanglingComments(path, options, filter);

    if (entries.length === 0) {
        return "";
    }

    return entries.map(({ comment, printed }) =>
        comment.attachToBrace ? [" ", printed] : [printed]
    );
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
        parts.push(whitespaceToDoc(comment.leadingWS));
    }

    parts.push([printed]);

    if (index !== finalIndex) {
        parts.push(resolveDanglingCommentSeparator(comment));
    }
}

function resolveDanglingCommentSeparator(comment) {
    if (isDecorativeBlockComment(comment)) {
        return hardline;
    }
    const separator = whitespaceToDoc(comment.trailingWS);
    return separator === "" ? " " : separator;
}

function handleCommentInEmptyBody(
    comment /*, text, options, ast, isLastComment */
) {
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

    if (
        !Number.isFinite(commentLine) ||
        !Number.isFinite(precedingEndLine) ||
        !Number.isFinite(followingStartLine)
    ) {
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
    const leadingWhitespace =
        typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    if (!/\r|\n/.test(leadingWhitespace)) {
        comment.leadingWS = "\n";
    }
    comment.trailingWS = "\n";
    return true;
}

function handleDecorativeBlockCommentOwnLine(comment, _text, _options, ast) {
    void _text;
    void _options;
    if (!comment || comment.type !== "CommentBlock") {
        return false;
    }

    const decorated = formatDecorativeBlockComment(comment.value);
    if (decorated === null) {
        return false;
    }

    const followingNode =
        comment.followingNode ?? findFollowingNodeForComment(ast, comment);
    if (!followingNode) {
        return false;
    }

    if (Array.isArray(followingNode.comments)) {
        const index = followingNode.comments.indexOf(comment);
        if (index !== -1) {
            followingNode.comments.splice(index, 1);
        }
    }
    addLeadingComment(followingNode, comment);
    if (
        comment.precedingNode &&
        Array.isArray(comment.precedingNode.comments)
    ) {
        const index = comment.precedingNode.comments.indexOf(comment);
        if (index !== -1) {
            comment.precedingNode.comments.splice(index, 1);
        }
    }
    comment.precedingNode = null;
    comment.followingNode = followingNode;
    comment.leading = true;
    comment.trailing = false;
    comment.placement = "ownLine";
    const leadingWhitespace =
        typeof comment.leadingWS === "string" ? comment.leadingWS : "";
    if (!/\r|\n/.test(leadingWhitespace)) {
        comment.leadingWS = "\n";
    }
    comment.trailingWS = "\n";
    return true;
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
        if (!node || typeof node !== "object") {
            continue;
        }

        if (visited.has(node)) {
            continue;
        }
        visited.add(node);

        if (Core.isNode(node) && !Core.isCommentNode(node)) {
            const startIndex = Core.getNodeStartIndex(node);
            if (
                typeof startIndex === "number" &&
                startIndex > commentEndIndex &&
                startIndex < candidateStart
            ) {
                candidate = node;
                candidateStart = startIndex;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "comments" || key === "docComments") {
                continue;
            }
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

    return formatDecorativeBlockComment(comment.value) !== null;
}

function handleCommentAttachedToOpenBrace(
    comment,
    _text,
    _options,
    ast /*, isLastComment */
) {
    void _text;
    void _options;
    let enclosingNode = comment.enclosingNode;

    if (!enclosingNode && comment?.leadingChar === "{") {
        enclosingNode = findBraceOwnerForComment(ast, comment);
        if (enclosingNode) {
            comment.enclosingNode = enclosingNode;
        }
    }

    if (
        !isBlockStatement(enclosingNode) &&
        enclosingNode?.type !== "SwitchStatement"
    ) {
        return false;
    }

    if (!isCommentOnNodeStartLine(comment, enclosingNode)) {
        return false;
    }

    comment.attachToBrace = true;
    addDanglingComment(enclosingNode, comment, false);
    return true;
}

function handleClauseBlockIntroComment(
    comment,
    _text,
    _options,
    _ast /*, isLastComment */
) {
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

    const { index: commentIndex, line: commentLine } = getLocationMetadata(
        comment.start
    );

    if (!Number.isFinite(commentIndex) || !Number.isFinite(commentLine)) {
        return null;
    }

    let match = null;
    const stack = [ast];
    const seen = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object" || seen.has(node)) {
            continue;
        }

        seen.add(node);

        if (!node.type) {
            continue;
        }

        const { index: startIndex, line: startLine } = getLocationMetadata(
            node.start
        );
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
                for (const entry of value) {
                    if (hasTypeProperty(entry) && entry.type) {
                        stack.push(entry);
                    }
                }
                continue;
            }

            if (
                hasTypeProperty(value) &&
                value.type &&
                value.type !== "CommentBlock" &&
                value.type !== "CommentLine"
            ) {
                stack.push(value);
            }
        }
    }

    return match;
}

function getLocationMetadata(position) {
    if (position == null) {
        return { index: Number.NaN, line: Number.NaN };
    }

    if (typeof position === "number") {
        return { index: position, line: Number.NaN };
    }

    const index =
        typeof position.index === "number" ? position.index : Number.NaN;
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

function handleCommentInEmptyParens(
    comment /*, text, options, ast, isLastComment */
) {
    if (comment.leadingChar !== "(" || comment.trailingChar !== ")") {
        return false;
    }

    return attachDanglingCommentToEmptyNode(comment, EMPTY_PARENS_TARGETS);
}

function handleCommentInEmptyLiteral(
    comment /*, text, options, ast, isLastComment */
) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_LITERAL_TARGETS);
}

function handleOnlyComments(comment, options, ast /*, isLastComment */) {
    if (attachDocCommentToFollowingNode(comment, options)) {
        return true;
    }

    const emptyProgram = findEmptyProgramTarget(
        ast,
        comment.enclosingNode,
        comment.followingNode
    );
    if (emptyProgram) {
        addDanglingComment(emptyProgram, comment, false);
        return true;
    }

    return false;
}

function attachDocCommentToFollowingNode(comment, options) {
    const { followingNode } = comment;

    if (!isDocCommentCandidate(comment, followingNode)) {
        return false;
    }

    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formatted = Core.formatLineComment(comment, lineCommentOptions);
    if (!formatted || !formatted.startsWith("///")) {
        return false;
    }

    if (!followingNode.docComments) {
        followingNode.docComments = [];
    }
    followingNode.docComments.push(comment);
    comment.printed = true;
    return true;
}

function isDocCommentCandidate(comment, followingNode) {
    if (!followingNode || typeof followingNode !== "object") {
        return false;
    }

    if (comment.type !== "CommentLine") {
        return false;
    }

    return (
        followingNode.type === "FunctionDeclaration" ||
        followingNode.type === "ConstructorDeclaration" ||
        followingNode.type === "VariableDeclaration"
    );
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

function formatDecorativeBlockComment(value) {
    if (typeof value !== "string") {
        return null;
    }

    const DECORATIVE_SLASH_LINE_PATTERN = new RegExp(
        String.raw`^\s*\*?\/{${Core.LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES},}\*?\s*$`
    );

    const lines = value
        .split(/\r?\n/)
        .map((line) => line.replaceAll("\t", "    "));
    const significantLines = lines.filter((line) =>
        Core.isNonEmptyTrimmedString(line)
    );
    if (significantLines.length === 0) {
        return null;
    }

    const hasDecoration = significantLines.some((line) =>
        DECORATIVE_SLASH_LINE_PATTERN.test(line)
    );
    if (!hasDecoration) {
        return null;
    }

    const textLines = significantLines
        .filter((line) => !DECORATIVE_SLASH_LINE_PATTERN.test(line))
        .map((line) => line.trim());

    if (textLines.length === 0) {
        return "";
    }

    if (textLines.length === 1) {
        return `// ${textLines[0]}`;
    }

    return ["/* ", ...textLines.map((line) => ` * ${line}`), " */"].join("\n");
}

function whitespaceToDoc(text) {
    const lineBreakCount = Core.getLineBreakCount(text);
    if (lineBreakCount === 0) {
        return text;
    }

    const lines = Core.splitLines(text);
    return join(hardline, lines);
}

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
};
