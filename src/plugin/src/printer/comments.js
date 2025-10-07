import { util } from "prettier";
import { builders } from "prettier/doc";
import { getLineBreakCount } from "../../../shared/line-breaks.js";

const { addDanglingComment, addTrailingComment } = util;

const { join, indent, hardline, dedent } = builders;

const BOILERPLATE_COMMENTS = [
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
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

const jsDocReplacements = {
    "@func": "@function",
    "@method": "@function",
    "@yield": "@returns",
    "@yields": "@returns",
    "@return": "@returns",
    "@desc": "@description",
    "@arg": "@param",
    "@argument": "@param",
    "@overrides": "@override",
    "@exception": "@throws",
    "@private": "@hide"
    // Add more replacements here as needed
};

function printComment(commentPath, options) {
    const comment = commentPath.getValue();
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
            return formatLineComment(comment);
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function formatLineComment(comment) {
    const fullText = comment.leadingText || comment.raw || "";
    const original = fullText || `//${comment.value}`;
    const trimmedOriginal = original.trim();
    const trimmedValue = comment.value.trim();

    for (const lineFragment of BOILERPLATE_COMMENTS) {
        if (trimmedValue.includes(lineFragment)) {
            console.log(`Removed boilerplate comment: ${lineFragment}`);
            return "";
        }
    }

    const slashesMatch = original.match(/^\s*(\/\/+)(.*)$/);
    if (slashesMatch && slashesMatch[1].length > 4) {
        return applyInlinePadding(comment, original.trim());
    }

    if (trimmedOriginal.startsWith("///") && !trimmedOriginal.includes("@")) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docLikeMatch = trimmedValue.match(/^\/\s*(.*)$/);
    if (docLikeMatch) {
        const remainder = docLikeMatch[1] ?? "";
        if (remainder.startsWith("/")) {
            // comments like "// comment" should stay as regular comments
        } else {
            let formatted = remainder.length > 0 ? `/// ${remainder}` : "///";
            formatted = applyJsDocReplacements(formatted);
            return applyInlinePadding(comment, formatted);
        }
    }

    const regexPattern = /^\/+(\s*)@/;
    const match = trimmedValue.match(regexPattern);
    if (match) {
        let formattedCommentLine = "///" + trimmedValue.replace(regexPattern, " @");
        formattedCommentLine = applyJsDocReplacements(formattedCommentLine);
        return applyInlinePadding(comment, formattedCommentLine);
    }

    const isInlineComment = comment && typeof comment.inlinePadding === "number";
    const sentences = !isInlineComment ? splitCommentIntoSentences(trimmedValue) : [trimmedValue];
    if (sentences.length > 1) {
        const formattedSentences = sentences.map((sentence) =>
            applyInlinePadding(comment, `// ${sentence}`)
        );
        return formattedSentences.join("\n");
    }

    return applyInlinePadding(comment, "// " + trimmedValue);
}

function applyInlinePadding(comment, formattedText) {
    if (
        comment &&
        typeof comment.inlinePadding === "number" &&
        comment.inlinePadding > 0 &&
        formattedText.startsWith("//")
    ) {
        return " ".repeat(comment.inlinePadding) + formattedText;
    }

    return formattedText;
}

function applyJsDocReplacements(text) {
    let formattedText = /@/i.test(text)
        ? text.replace(/\(\)\s*$/, "")
        : text;

    for (let [oldWord, newWord] of Object.entries(jsDocReplacements)) {
        const regex = new RegExp(`(\/\/\/\\s*)${oldWord}\\b`, "gi");
        formattedText = formattedText.replace(regex, `$1${newWord}`);
    }

    return formattedText;
}

function splitCommentIntoSentences(text) {
    if (!text || !text.includes(". ")) {
        return [text];
    }

    const splitPattern = /(?<=\.)\s+(?=[A-Z])/g;
    const segments = text.split(splitPattern)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    return segments.length > 0 ? segments : [text];
}

function collectDanglingComments(path, filter) {
    const node = path.getValue();
    if (!node || !node.comments) {
        return { entries: [], totalCount: 0 };
    }

    const entries = [];
    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (
            comment &&
            !comment.leading &&
            !comment.trailing &&
            (!filter || filter(comment))
        ) {
            entries.push({ commentPath, comment });
        }
    }, "comments");

    return { entries, totalCount: node.comments.length };
}

function printDanglingComments(path, options, sameIndent, filter) {
    const { entries } = collectDanglingComments(path, filter);
    if (entries.length === 0) {
        return "";
    }

    return entries.map(({ commentPath, comment }) => (
        comment.attachToBrace
            ? [" ", printComment(commentPath, options)]
            : [printComment(commentPath, options)]
    ));
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

    for (const { commentPath, comment } of entries) {
        if (i === 0) {
            parts.push(whitespaceToDoc(comment.leadingWS));
        }
        parts.push([printComment(commentPath, options)]);
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
    if (
        comment.enclosingNode?.type === "BlockStatement"
    ) {
        // if a comment is enclosed in a block statement and starts on the same line,
        // it is considered "attached" to the opening brace.
        if (comment.start.line === comment.enclosingNode.start.line) {
            comment.attachToBrace = true;
            addDanglingComment(comment.enclosingNode, comment);
            return true;
        }
        return false;
    }
    return false;
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
        const formatted = formatLineComment(comment);

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
    printComment,
    formatLineComment
};
