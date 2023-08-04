import { util } from "prettier";
import { builders } from "prettier/doc";

const { addLeadingComment, addDanglingComment, addTrailingComment } = util;

const { join, indent, hardline, dedent } = builders;

const handleComments = {
    ownLine(comment, text, options, ast, isLastComment) {
        return (
            handleCommentInEmptyBody(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleCommentInEmptyParens(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleOnlyComments(comment, text, options, ast, isLastComment) ||
            false
        );
    },
    endOfLine(comment, text, options, ast, isLastComment) {
        return (
            handleOnlyComments(comment, text, options, ast, isLastComment) ||
            handleCommentAttachedToOpenBrace(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleCommentInEmptyParens(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleMacroComments(comment) ||
            false
        );
    },
    remaining(comment, text, options, ast, isLastComment) {
        return (
            handleOnlyComments(comment, text, options, ast, isLastComment) ||
            handleCommentAttachedToOpenBrace(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleCommentInEmptyParens(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleCommentInEmptyLiteral(
                comment,
                text,
                options,
                ast,
                isLastComment
            ) ||
            handleMacroComments(comment) ||
            false
        );
    }
};

const jsDocReplacements = {
    "@func": "@function",
    "@desc": "@description",
    "@arg": "@param"
    // Add more replacements here as needed
};

function printComment(commentPath, options) {
    const comment = commentPath.getValue();
    comment.printed = true;
    switch (comment.type) {
        case "CommentBlock": {
            return `/*${comment.value}*/`;
        }
        case "CommentLine": {
            const trimmedValue = comment.value.trim();
            // Use regular expression to match any sequence starting with '/'
            const regexPattern = /^\/(\s*)@/;
            const match = trimmedValue.match(regexPattern);
            if (match) {  // JSDoc comment
                // Replace '/' (and any spaces after it) with ' ' and prepend with '///'
                let formattedCommentLine = "///" + trimmedValue.replace(regexPattern, ' @');
                
                // Check for empty parentheses at the end of the comment line and remove them
                formattedCommentLine = formattedCommentLine.replace(/\(\)\s*$/, '');

                // Loop through each replacement and apply it
                for (let [oldWord, newWord] of Object.entries(jsDocReplacements)) {
                    const regex = new RegExp(`(\/\/\/\\s*)${oldWord}\\b`, "gi");
                    formattedCommentLine = formattedCommentLine.replace(regex, `$1${newWord}`);
                }

                return formattedCommentLine;
            } else {
                return "// " + trimmedValue;
            }
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function printDanglingComments(path, options, sameIndent, filter) {
    const parts = [];
    const node = path.getValue();

    if (!node || !node.comments) {
        return "";
    }

    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (
            comment &&
            !comment.leading &&
            !comment.trailing &&
            (!filter || filter(comment))
        ) {
            if (comment.attachToBrace) {
                parts.push([" ", printComment(commentPath, options)]);
            } else {
                parts.push([printComment(commentPath, options)]);
            }
        }
    }, "comments");

    if (parts.length === 0) {
        return "";
    }

    return parts;
}

// print dangling comments and preserve the whitespace around the comments.
// this function behaves similarly to the default comment algorithm.
function printDanglingCommentsAsGroup(path, options, sameIndent, filter) {
    const parts = [];
    const node = path.getValue();

    if (!node || !node.comments) {
        return "";
    }

    let i = 0;
    const finalIndex = node.comments.length - 1;

    path.each((commentPath) => {
        const comment = commentPath.getValue();
        if (
            comment &&
            !comment.leading &&
            !comment.trailing &&
            (!filter || filter(comment))
        ) {
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
    }, "comments");

    if (parts.length === 0) {
        return "";
    }

    return parts;
}


function handleCommentInEmptyBody(comment, text, options, ast, isLastComment) {
    if (
        comment.enclosingNode?.type === "BlockStatement" &&
        comment.enclosingNode?.body.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    return false;
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

    if (
        comment.enclosingNode?.type === "CallExpression" &&
        comment.enclosingNode?.arguments.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    if (
        (
            comment.enclosingNode?.type === "ConstructorParentClause" ||
            comment.enclosingNode?.type === "FunctionDeclaration" ||
            comment.enclosingNode?.type === "ConstructorDeclaration"
        ) && comment.enclosingNode?.params.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    return false;
}

function handleCommentInEmptyLiteral(
    comment,
    text,
    options,
    ast,
    isLastComment
) {
    if (
        comment.enclosingNode?.type === "ArrayExpression" &&
        comment.enclosingNode?.elements.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    if (
        comment.enclosingNode?.type === "StructExpression" &&
        comment.enclosingNode?.properties.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    if (
        comment.enclosingNode?.type === "EnumDeclaration" &&
        comment.enclosingNode?.members.length === 0
    ) {
        addDanglingComment(comment.enclosingNode, comment);
        return true;
    }

    return false;
}

function handleOnlyComments(comment, text, options, ast, isLastComment) {
    const { enclosingNode, followingNode } = comment;

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

function getLineBreakCount(text) {
    return text.split(/[\r\n\u2028\u2029]/).length - 1;
}

// note: this preserves non-standard whitespaces!
function whitespaceToDoc(text) {
    const lines = text.split(/[\r\n\u2028\u2029]/);
    if (lines.length === 1) {
        return lines[0];
    } else {
        return join(hardline, lines);
    }
}

export {
    printDanglingComments,
    printDanglingCommentsAsGroup,
    handleComments,
    printComment
};
