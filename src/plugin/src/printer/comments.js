import { util } from "prettier";
import { builders } from "prettier/doc";
import { getLineBreakCount } from "../../../shared/line-breaks.js";
import {
    getLineCommentRawText,
    formatLineComment,
    getLineCommentBannerMinimum,
    getLineCommentBannerAutofillThreshold,
    applyInlinePadding,
    isCommentNode
} from "./comment-utils.js";

const { addDanglingComment, addTrailingComment } = util;

const { join, indent, hardline, dedent } = builders;

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
        const isEmptyArray = Array.isArray(collection) && collection.length === 0;
        const isCollectionMissing = collection == null;
        if (isEmptyArray || isCollectionMissing) {
            addDanglingComment(node, comment);
            return true;
        }
    }

    return false;
}

const EMPTY_BODY_TARGETS = [
    { type: "BlockStatement", property: "body" }
];

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

function runCommentHandlers(handlers, comment, text, options, ast, isLastComment) {
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
        if (comment && typeof comment === "object") {
            comment.printed = true;
        }
        return "";
    }
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
            const bannerMinimum = getLineCommentBannerMinimum(options);
            const bannerAutofillThreshold = getLineCommentBannerAutofillThreshold(options);
            const rawText = getLineCommentRawText(comment);
            const bannerMatch = rawText.match(/^\s*(\/\/+)/);

            if (!bannerMatch) {
                return formatLineComment(comment, bannerMinimum);
            }

            const slashRun = bannerMatch[1];
            const slashCount = slashRun.length;
            if (slashCount >= bannerMinimum) {
                return applyInlinePadding(comment, rawText.trim());
            }

            const remainder = rawText.slice(rawText.indexOf(slashRun) + slashCount);
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

            return formatLineComment(comment, bannerMinimum);
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function collectDanglingComments(path, filter) {
    const node = path.getValue();
    if (!node || !node.comments) {
        return { entries: [], totalCount: 0 };
    }

    const entries = [];
    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (!isCommentNode(comment)) {
            return;
        }
        if (
            comment &&
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

    return { entries, totalCount: entries.length };
}

function printDanglingComments(path, options, sameIndent, filter) {
    const { entries } = collectDanglingComments(path, filter);
    if (entries.length === 0) {
        return "";
    }

    return entries.map(({ commentIndex, comment }) => {
        const printedComment = path.call(
            (commentPath) => printComment(commentPath, options),
            "comments",
            commentIndex
        );

        return comment.attachToBrace
            ? [" ", printedComment]
            : [printedComment];
    });
}

// print dangling comments and preserve the whitespace around the comments.
// this function behaves similarly to the default comment algorithm.
function printDanglingCommentsAsGroup(path, options, sameIndent, filter) {
    const { entries, totalCount } = collectDanglingComments(path, filter);
    if (entries.length === 0) {
        return "";
    }

    const parts = [];
    let i = 0;
    const finalIndex = totalCount - 1;

    for (const { commentIndex, comment } of entries) {
        if (i === 0) {
            parts.push(whitespaceToDoc(comment.leadingWS));
        }
        const printedComment = path.call(
            (commentPath) => printComment(commentPath, options),
            "comments",
            commentIndex
        );
        parts.push([printedComment]);
        if (i !== finalIndex) {
            let wsDoc = whitespaceToDoc(comment.trailingWS);
            // enforce at least one space between comments
            if (wsDoc === "") {
                wsDoc = " ";
            }
            parts.push(wsDoc);
        }
        i += 1;
    }

    return parts;
}


function handleCommentInEmptyBody(comment, text, options, ast, isLastComment) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_BODY_TARGETS);
}

// ignore macro comments because macros are printed exactly as-is
function handleMacroComments(comment) {
    if (
        comment.enclosingNode?.type === "MacroDeclaration"
    ) {
        comment.printed = true;
        return true;
    }
    return false;
}

function handleCommentAttachedToOpenBrace(
    comment,
    text,
    options,
    ast,
    isLastComment
) {
    if (comment.enclosingNode?.type !== "BlockStatement") {
        return false;
    }

    // A comment enclosed in a block statement that begins on the same line as the
    // opening brace should attach to that brace.
    if (comment.start.line !== comment.enclosingNode.start.line) {
        return false;
    }

    comment.attachToBrace = true;
    addDanglingComment(comment.enclosingNode, comment);
    return true;
}

function handleCommentInEmptyParens(
    comment,
    text,
    options,
    ast,
    isLastComment
) {

    if (comment.leadingChar != "(" || comment.trailingChar != ")") {
        return false;
    }

    return attachDanglingCommentToEmptyNode(comment, EMPTY_PARENS_TARGETS);
}

function handleCommentInEmptyLiteral(
    comment,
    text,
    options,
    ast,
    isLastComment
) {
    return attachDanglingCommentToEmptyNode(comment, EMPTY_LITERAL_TARGETS);
}

function handleOnlyComments(comment, text, options, ast, isLastComment) {
    const { enclosingNode, followingNode } = comment;

    if (
        followingNode &&
        typeof followingNode === "object" &&
        comment.type === "CommentLine" &&
        (followingNode.type === "FunctionDeclaration" || followingNode.type === "ConstructorDeclaration")
    ) {
        const bannerMinimum = getLineCommentBannerMinimum(options);
        const formatted = formatLineComment(comment, bannerMinimum);

        if (formatted && formatted.startsWith("///")) {
            comment.printed = true;
            if (!followingNode.docComments) {
                followingNode.docComments = [];
            }
            followingNode.docComments.push(comment);
            return true;
        }
    }

    if (ast && ast.body && ast.body.length === 0) {
        addDanglingComment(ast, comment);
        return true;
    }

    if (enclosingNode?.type === "Program" && enclosingNode?.body.length === 0) {
        addDanglingComment(enclosingNode, comment);
        return true;
    }

    if (followingNode?.type === "Program" && followingNode?.body.length === 0) {
        addDanglingComment(followingNode, comment);
        return true;
    }

    return false;
}

// note: this preserves non-standard whitespaces!
function whitespaceToDoc(text) {
    const lines = text.split(/[\r\n\u2028\u2029]/);

    if (getLineBreakCount(text) === 0) {
        return lines[0];
    }

    return join(hardline, lines);
}

export {
    printDanglingComments,
    printDanglingCommentsAsGroup,
    handleComments,
    printComment
};
