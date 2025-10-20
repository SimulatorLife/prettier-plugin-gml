import { util } from "prettier";
import { builders } from "prettier/doc";
import {
    getLineBreakCount,
    isCommentNode,
    isObjectLike
} from "./comment-boundary.js";
import {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText
} from "./line-comment-formatting.js";
import {
    LINE_COMMENT_BANNER_DETECTION_MIN_SLASHES,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
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
        const isCollectionMissing = collection == undefined;
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
    handleCommentAttachedToOpenBrace,
    handleCommentInEmptyParens
];

const END_OF_LINE_COMMENT_HANDLERS = [
    ...COMMON_COMMENT_HANDLERS,
    handleMacroComments
];

const REMAINING_COMMENT_HANDLERS = [
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
    if (comment?._structPropertyTrailing) {
        if (comment._structPropertyHandled) {
            return "";
        }
        comment._structPropertyHandled = true;
    }
    comment.printed = true;

    switch (comment.type) {
        case "CommentBlock": {
            return `/*${comment.value}*/`;
        }
        case "CommentLine": {
            const lineCommentOptions = resolveLineCommentOptions(options);
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

            const bannerLength =
                typeof lineCommentOptions.bannerLength === "number"
                    ? lineCommentOptions.bannerLength
                    : LINE_COMMENT_BANNER_STANDARD_LENGTH;
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

    const parts = [];
    const finalIndex = entries.length - 1;

    for (const [index, { comment, printed }] of entries.entries()) {
        if (index === 0) {
            parts.push(whitespaceToDoc(comment.leadingWS));
        }

        parts.push([printed]);

        if (index !== finalIndex) {
            let wsDoc = whitespaceToDoc(comment.trailingWS);
            if (wsDoc === "") {
                wsDoc = " ";
            }
            parts.push(wsDoc);
        }
    }

    return parts;
}

function handleCommentInEmptyBody(
    comment /*, text, options, ast, isLastComment */
) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_BODY_TARGETS);
}

function handleMacroComments(comment) {
    if (comment.enclosingNode?.type === "MacroDeclaration") {
        comment.printed = true;
        return true;
    }
    return false;
}

function handleCommentAttachedToOpenBrace(
    comment /*, text, options, ast, isLastComment */
) {
    const enclosingNode = comment.enclosingNode;

    if (!isBlockStatement(enclosingNode)) {
        return false;
    }

    if (!isCommentOnNodeStartLine(comment, enclosingNode)) {
        return false;
    }

    comment.attachToBrace = true;
    addDanglingComment(enclosingNode, comment);
    return true;
}

function isBlockStatement(node) {
    return node?.type === "BlockStatement";
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

    if (commentLine == null || nodeStartLine == null) {
        return false;
    }

    return commentLine === nodeStartLine;
}

function handleCommentInEmptyParens(
    comment /*, text, options, ast, isLastComment */
) {
    if (comment.leadingChar != "(" || comment.trailingChar != ")") {
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

    const lines = text.split(/[\r\n\u2028\u2029]/);
    return join(hardline, lines);
}

export {
    handleComments,
    printComment,
    printDanglingComments,
    printDanglingCommentsAsGroup
};
