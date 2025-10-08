import { util } from "prettier";
import { builders } from "prettier/doc";
import { getLineBreakCount } from "../../../shared/line-breaks.js";

const { addDanglingComment, addTrailingComment } = util;

const { join, indent, hardline, dedent } = builders;

const DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES = 5;
const DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD = 4;

const BOILERPLATE_COMMENTS = [
    "Script assets have changed for v2.3.0",
    "https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information"
];

function getLineCommentBannerMinimum(options) {
    const configuredValue = options?.lineCommentBannerMinimumSlashes;

    if (typeof configuredValue === "number" && Number.isFinite(configuredValue)) {
        const normalized = Math.floor(configuredValue);
        if (normalized > 0) {
            return normalized;
        }
    }

    return DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES;
}

function getLineCommentBannerAutofillThreshold(options) {
    const configuredValue = options?.lineCommentBannerAutofillThreshold;

    if (typeof configuredValue === "number" && Number.isFinite(configuredValue)) {
        const normalized = Math.floor(configuredValue);
        if (normalized > 0) {
            return normalized;
        }

        return Number.POSITIVE_INFINITY;
    }

    return DEFAULT_LINE_COMMENT_BANNER_AUTOFILL_THRESHOLD;
}

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

const GAME_MAKER_TYPE_NORMALIZATIONS = new Map(
    Object.entries({
        void: "undefined",
        undefined: "undefined",
        real: "real",
        bool: "bool",
        boolean: "boolean",
        string: "string",
        array: "array",
        struct: "struct",
        enum: "enum",
        pointer: "pointer",
        method: "method",
        asset: "asset",
        any: "any",
        var: "var",
        int64: "int64",
        int32: "int32",
        int16: "int16",
        int8: "int8",
        uint64: "uint64",
        uint32: "uint32",
        uint16: "uint16",
        uint8: "uint8"
    })
);

function isCommentNode(node) {
    return (
        node &&
        typeof node === "object" &&
        (node.type === "CommentBlock" || node.type === "CommentLine")
    );
}

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
            const rawText = comment.leadingText || comment.raw || `//${comment.value}`;
            const bannerMatch = rawText.match(/^\s*(\/\/+)/);

            if (bannerMatch) {
                const slashRun = bannerMatch[1];
                const slashCount = slashRun.length;
                if (slashCount >= bannerMinimum) {
                    return applyInlinePadding(comment, rawText.trim());
                }

                const remainder = rawText.slice(rawText.indexOf(slashRun) + slashCount);
                const remainderTrimmed = remainder.trimStart();
                if (
                    slashCount >= bannerAutofillThreshold &&
                    bannerMinimum > slashCount &&
                    remainderTrimmed.length > 0 &&
                    !remainderTrimmed.startsWith("@")
                ) {
                    const padded = `${"/".repeat(bannerMinimum)}${remainder}`;
                    return applyInlinePadding(comment, padded.trimEnd());
                }
            }

            return formatLineComment(comment, bannerMinimum);
        }
        default: {
            throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
        }
    }
}

function formatLineComment(comment, bannerMinimumSlashes = DEFAULT_LINE_COMMENT_BANNER_MIN_SLASHES) {
    const fullText = comment.leadingText || comment.raw || "";
    const original = fullText || `//${comment.value}`;
    const trimmedOriginal = original.trim();
    const trimmedValue = comment.value.trim();
    const rawValue = typeof comment.value === "string" ? comment.value : "";

    const leadingSlashMatch = trimmedOriginal.match(/^\/+/);
    const leadingSlashCount = leadingSlashMatch ? leadingSlashMatch[0].length : 0;

    for (const lineFragment of BOILERPLATE_COMMENTS) {
        if (trimmedValue.includes(lineFragment)) {
            console.log(`Removed boilerplate comment: ${lineFragment}`);
            return "";
        }
    }

    const slashesMatch = original.match(/^\s*(\/\/+)(.*)$/);
    if (slashesMatch && slashesMatch[1].length >= bannerMinimumSlashes) {
        return applyInlinePadding(comment, original.trim());
    }

    if (
        trimmedOriginal.startsWith("///") &&
        !trimmedOriginal.includes("@") &&
        leadingSlashCount >= bannerMinimumSlashes
    ) {
        return applyInlinePadding(comment, trimmedOriginal);
    }

    const docLikeMatch = trimmedValue.match(/^\/\s*(.*)$/);
    if (docLikeMatch) {
        const remainder = docLikeMatch[1] ?? "";
        // comments like "// comment" should stay as regular comments, so bail out when the
        // remainder begins with another slash
        if (!remainder.startsWith("/")) {
            const shouldInsertSpace = remainder.length > 0 && /\w/.test(remainder);
            const formatted = applyJsDocReplacements(`///${shouldInsertSpace ? " " : ""}${remainder}`);
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

    const leadingWhitespaceMatch = rawValue.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
    const valueWithoutTrailingWhitespace = rawValue.replace(/\s+$/, "");
    const coreValue = valueWithoutTrailingWhitespace.slice(leadingWhitespace.length).trim();

    if (coreValue.length > 0 && (trimmedValue.startsWith("//") || looksLikeCommentedOutCode(coreValue))) {
        return applyInlinePadding(comment, `//${leadingWhitespace}${coreValue}`);
    }

    return applyInlinePadding(comment, "// " + trimmedValue);
}

function looksLikeCommentedOutCode(text) {
    if (typeof text !== "string") {
        return false;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return false;
    }

    if (/^(?:if|else|for|while|switch|do|return|break|continue|repeat|with|var|global|enum|function)\b/i.test(trimmed)) {
        return true;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\.|\(|\[|=)/.test(trimmed)) {
        return true;
    }

    if (/^[{}()[\].]/.test(trimmed)) {
        return true;
    }

    if (/^#/.test(trimmed)) {
        return true;
    }

    if (/^@/.test(trimmed)) {
        return true;
    }

    return false;
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

    formattedText = stripTrailingFunctionParameters(formattedText);

    return normalizeDocCommentTypeAnnotations(formattedText);
}

const FUNCTION_SIGNATURE_PATTERN = /(^|\n)(\s*\/\/\/\s*@function\b[^\r\n]*?)(\s*\([^\)]*\))(\s*(?=\r?\n|$))/gi;

function stripTrailingFunctionParameters(text) {
    if (typeof text !== "string" || !/@function\b/i.test(text)) {
        return text;
    }

    return text.replace(
        FUNCTION_SIGNATURE_PATTERN,
        (match, linePrefix, functionPrefix) =>
            `${linePrefix}${functionPrefix.replace(/\s+$/, "")}`
    );
}

function normalizeDocCommentTypeAnnotations(text) {
    if (typeof text !== "string" || text.indexOf("{") === -1) {
        return text;
    }

    return text.replace(/\{([^}]+)\}/g, (match, typeText) => {
        const normalized = normalizeGameMakerType(typeText);
        return `{${normalized}}`;
    });
}

function normalizeGameMakerType(typeText) {
    if (typeof typeText !== "string") {
        return typeText;
    }

    return typeText.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (identifier) => {
        const normalized = GAME_MAKER_TYPE_NORMALIZATIONS.get(identifier.toLowerCase());
        return normalized ?? identifier;
    });
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
    printComment,
    formatLineComment,
    getLineCommentBannerMinimum,
    normalizeDocCommentTypeAnnotations,
    isCommentNode
};
