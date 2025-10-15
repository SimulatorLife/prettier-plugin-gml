import { util } from "prettier";
import { builders } from "prettier/doc";
import { isCommentNode } from "../../../shared/comments.js";
import { getLineBreakCount } from "../../../shared/line-breaks.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import {
    applyInlinePadding,
    formatLineComment,
    getLineCommentRawText
} from "./line-comment-formatting.js";
import {
    getTrailingCommentInlinePadding,
    getTrailingCommentPadding,
    resolveLineCommentOptions
} from "../options/line-comment-options.js";

const { addDanglingComment } = util;
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
        const isCollectionMissing = collection == null;
        if (isEmptyArray || isCollectionMissing) {
            addDanglingComment(node, comment);
            return true;
        }
    }

    return false;
}

const OWN_LINE_COMMENT_HANDLERS = [
    handleCommentInEmptyBody,
    handleCommentInEmptyParens,
    handleOnlyComments
];

const COMMON_COMMENT_HANDLERS = [
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

    applyTrailingCommentPadding(comment, options);
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
            const { bannerMinimum, bannerAutofillThreshold } =
                lineCommentOptions;
            const rawText = getLineCommentRawText(comment);
            const bannerMatch = rawText.match(/^\s*(\/\/+)/);

            if (!bannerMatch) {
                return formatLineComment(comment, lineCommentOptions);
            }

            const slashRun = bannerMatch[1];
            const slashCount = slashRun.length;
            if (slashCount >= bannerMinimum) {
                return applyInlinePadding(comment, rawText.trim());
            }

            const bannerStart =
                typeof bannerMatch.index === "number"
                    ? bannerMatch.index
                    : rawText.indexOf(slashRun);
            const safeBannerStart = bannerStart >= 0 ? bannerStart : 0;
            const remainder = rawText.slice(safeBannerStart + slashCount);
            const remainderTrimmed = remainder.trimStart();
            const shouldAutofillBanner =
                slashCount >= bannerAutofillThreshold &&
                bannerMinimum > slashCount &&
                remainderTrimmed.length > 0 &&
                !remainderTrimmed.startsWith("@");

            if (shouldAutofillBanner) {
                const padded = `${"/".repeat(bannerMinimum)}${remainder}`;
                return applyInlinePadding(comment, padded.trimEnd());
            }

            return formatLineComment(comment, lineCommentOptions);
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function applyTrailingCommentPadding(comment, options) {
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

    const inlinePadding = getTrailingCommentInlinePadding(options);
    const trailingPadding = getTrailingCommentPadding(options);
    const baseTrailingPadding = Math.max(trailingPadding, 0);
    const enumPadding =
        typeof comment._enumTrailingPadding === "number"
            ? comment._enumTrailingPadding
            : 0;

    const inlineTotal = inlinePadding + 1;
    const trailingTotal = baseTrailingPadding + enumPadding;
    const desiredTotalPadding = Math.max(inlineTotal, trailingTotal);

    // Prettier automatically inserts a single space between trailing comments and
    // the preceding code. Treat the configured padding as the total desired
    // spacing and only request the additional padding beyond Prettier's
    // baseline. This keeps defaults like `trailingCommentPadding = 2` aligned
    // with historical expectations, while still honouring larger custom values.
    const adjustedPadding = Math.max(desiredTotalPadding - 1, 0);

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

    entries.forEach(({ comment, printed }, index) => {
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
    });

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
    if (comment.enclosingNode?.type !== "BlockStatement") {
        return false;
    }

    if (comment.start.line !== comment.enclosingNode.start.line) {
        return false;
    }

    comment.attachToBrace = true;
    addDanglingComment(comment.enclosingNode, comment);
    return true;
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
