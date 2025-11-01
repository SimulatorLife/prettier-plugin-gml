import { util } from "prettier";
import { builders } from "prettier/doc";
import {
    getLineBreakCount,
    isCommentNode,
    isObjectLike,
    splitLines
} from "./comment-boundary.js";
import {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText
} from "./line-comment-formatting.js";
import {
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    resolveLineCommentBannerLength,
    resolveLineCommentOptions
} from "../options/line-comment-options.js";

const { addDanglingComment, addLeadingComment } = util;
const { join, hardline } = builders;

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

function attachDanglingCommentToEmptyNode(comment, descriptors) {
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
        const isCollectionMissing =
            collection === undefined || collection === null;
        if (isEmptyArray || isCollectionMissing) {
            addDanglingComment(node, comment);
            return true;
        }
    }

    return false;
}

function handleHoistedDeclarationLeadingComment(comment) {
    const target = comment?._featherHoistedTarget;

    if (!target) {
        return false;
    }

    addLeadingComment(target, comment);
    delete comment._featherHoistedTarget;

    return true;
}

const OWN_LINE_COMMENT_HANDLERS = [
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
    handleDetachedOwnLineComment,
    ...COMMON_COMMENT_HANDLERS,
    handleMacroComments
];

const REMAINING_COMMENT_HANDLERS = [
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

const handleComments = {
    ownLine(comment, text, options, ast, isLastComment) {
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
    if (!isCommentNode(comment)) {
        if (isObjectLike(comment)) {
            comment.printed = true;
        }
        return "";
    }

    applyTrailingCommentPadding(comment);
    applySingleLeadingSpacePadding(comment, options);
    if (comment?._structPropertyTrailing) {
        comment._structPropertyHandled = true;
        comment.printed = true;
        return "";
    }
    comment.printed = true;

    switch (comment.type) {
        case "CommentBlock": {
            return `/*${comment.value}*/`;
        }
        case "CommentLine": {
            const lineCommentOptions = resolveLineCommentOptions(options);
            const bannerLength = resolveLineCommentBannerLength(options);
            const rawText = getLineCommentRawText(comment);
            const bannerMatch = rawText.match(/^\s*(\/{2,})/);

            if (!bannerMatch) {
                return formatLineComment(comment, lineCommentOptions);
            }

            const slashRun = bannerMatch[1];
            const slashCount = slashRun.length;
            if (slashCount < LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES) {
                return formatLineComment(comment, lineCommentOptions);
            }

            const bannerStart =
                typeof bannerMatch.index === "number"
                    ? bannerMatch.index
                    : rawText.indexOf(slashRun);
            const safeBannerStart = Math.max(bannerStart, 0);
            const remainder = rawText.slice(safeBannerStart + slashCount);
            const remainderTrimmed = remainder.trimStart();
            if (remainderTrimmed.startsWith("@")) {
                return formatLineComment(comment, lineCommentOptions);
            }

            const normalizedSlashRun =
                bannerLength <= 0 ? slashRun : "".padStart(bannerLength, "/");
            const normalizedBanner =
                `${normalizedSlashRun}${remainder}`.trimEnd();

            return applyInlinePadding(comment, normalizedBanner);
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function applySingleLeadingSpacePadding(comment, options) {
    if (!isObjectLike(comment) || !options) {
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

/**
 * Normalize the inline padding hint applied to trailing comments. Enum members
 * and struct properties annotate their comment nodes with extra padding so the
 * printer can preserve column alignment after banner normalization. This helper
 * makes sure that metadata is respected without clobbering explicit padding
 * requested by other formatting passes.
 *
 * @param {unknown} comment Candidate comment node to update.
 * @returns {void}
 */
function applyTrailingCommentPadding(comment) {
    if (!isObjectLike(comment)) {
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
            isCommentNode(comment) &&
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

/**
 * Assemble the doc parts representing a dangling comment group while keeping
 * the orchestration logic in {@link printDanglingCommentsAsGroup} focused on
 * collaborator sequencing instead of manual array bookkeeping.
 */
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
    delete comment.placement;
    return true;
}

function handleMacroComments(comment) {
    if (comment.enclosingNode?.type === "MacroDeclaration") {
        comment.printed = true;
        return true;
    }
    return false;
}

function handleCommentAttachedToOpenBrace(
    comment,
    _text,
    _options,
    ast /*, isLastComment */
) {
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
    addDanglingComment(enclosingNode, comment);
    return true;
}

function handleClauseBlockIntroComment(
    comment,
    _text,
    _options,
    _ast /*, isLastComment */
) {
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
        addDanglingComment(bodyNode, comment);
    } else {
        comment.attachToClauseBody = true;
        addDanglingComment(enclosingNode, comment);
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
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (entry && typeof entry === "object" && entry.type) {
                        stack.push(entry);
                    }
                }
                continue;
            }

            if (
                value &&
                typeof value === "object" &&
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

/**
 * Determines whether a comment starts on the same line as the enclosing node's
 * start token. This guards against reaching through multiple layers of the
 * syntax tree from the call site and keeps line comparisons centralized.
 *
 * @param {object} comment
 * @param {object} node
 * @returns {boolean}
 */
function isCommentOnNodeStartLine(comment, node) {
    const commentLine = comment.start?.line;
    const nodeStartLine = node?.start?.line;

    const isCommentLineMissing =
        commentLine === undefined || commentLine === null;
    const isNodeStartLineMissing =
        nodeStartLine === undefined || nodeStartLine === null;

    if (isCommentLineMissing || isNodeStartLineMissing) {
        return false;
    }

    return commentLine === nodeStartLine;
}

function isCommentOnNodeEndLine(comment, node) {
    const commentLine = comment.start?.line;
    const nodeEndLine = node?.end?.line;

    const isCommentLineMissing =
        commentLine === undefined || commentLine === null;
    const isNodeEndLineMissing =
        nodeEndLine === undefined || nodeEndLine === null;

    if (isCommentLineMissing || isNodeEndLineMissing) {
        return false;
    }

    return commentLine === nodeEndLine;
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
        addDanglingComment(emptyProgram, comment);
        return true;
    }

    return false;
}

function attachDocCommentToFollowingNode(comment, options) {
    const { followingNode } = comment;

    if (!isDocCommentCandidate(comment, followingNode)) {
        return false;
    }

    const lineCommentOptions = resolveLineCommentOptions(options);
    const formatted = formatLineComment(comment, lineCommentOptions);
    if (!formatted || !formatted.startsWith("///")) {
        return false;
    }

    comment.printed = true;
    const docComments =
        followingNode.docComments ?? (followingNode.docComments = []);
    docComments.push(comment);
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
        followingNode.type === "ConstructorDeclaration"
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

function whitespaceToDoc(text) {
    const lineBreakCount = getLineBreakCount(text);
    if (lineBreakCount === 0) {
        return text;
    }

    const lines = splitLines(text);
    return join(hardline, lines);
}

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
};
