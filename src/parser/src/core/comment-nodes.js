import { getLineBreakCount } from "../shared/index.js";

function normalizeTokenText(tokenText) {
    return typeof tokenText === "string" ? tokenText : "";
}

function buildBoundary(token, key, lineOffset = 0) {
    const rawLine = token?.line;
    const boundary = {
        line: typeof rawLine === "number" ? rawLine + lineOffset : rawLine,
        index: token?.[key]
    };

    if (typeof token?.column === "number") {
        boundary.column = token.column;
    }

    return boundary;
}

function assignCommentBookends(node, { leadingWS, leadingChar }) {
    node.leadingWS = typeof leadingWS === "string" ? leadingWS : "";
    node.trailingWS = "";
    node.leadingChar = typeof leadingChar === "string" ? leadingChar : "";
    node.trailingChar = "";
    return node;
}

function createCommentValue(type, tokenText) {
    if (type === "CommentLine") {
        return tokenText.replace(/^[\\/][\\/]/, "");
    }

    const withoutStart = tokenText.replace(/^[\\/][*]/, "");
    return withoutStart.replace(/[*][\\/]$/, "");
}

function createCommentNode(type, { token, tokenText, leadingWS, leadingChar }) {
    const text = normalizeTokenText(tokenText);
    const comment = assignCommentBookends(
        {
            type,
            value: createCommentValue(type, text),
            start: buildBoundary(token, "start"),
            end: buildBoundary(token, "stop")
        },
        { leadingWS, leadingChar }
    );

    if (type === "CommentBlock") {
        const lineBreakCount = getLineBreakCount(text);
        comment.end = buildBoundary(token, "stop", lineBreakCount);
        comment.lineCount = lineBreakCount + 1;
    }

    return comment;
}

export function createCommentLineNode(options) {
    return createCommentNode("CommentLine", options);
}

export function createCommentBlockNode(options) {
    return createCommentNode("CommentBlock", options);
}

export function createWhitespaceNode({ token, tokenText, isNewline }) {
    const text = normalizeTokenText(tokenText);
    const lineBreakCount = getLineBreakCount(text);

    return {
        type: "Whitespace",
        value: text,
        start: buildBoundary(token, "start"),
        end: buildBoundary(token, "stop", lineBreakCount),
        line: typeof token?.line === "number" ? token.line : token?.line,
        isNewline: Boolean(isNewline)
    };
}
