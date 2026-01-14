import { Core } from "@gml-modules/core";

function createState() {
    return {
        reachedEOF: false,
        prevComment: null,
        finalComment: null,
        prevWS: "",
        prevSignificantChar: "",
        foundFirstSignificantToken: false
    };
}

function markTopCommentIfNeeded(state) {
    if (!state.foundFirstSignificantToken && state.prevComment) {
        state.prevComment.isTopComment = true;
        state.foundFirstSignificantToken = true;
    }
}

function registerComment(state, list, comment) {
    state.prevComment = comment;
    state.finalComment = comment;
    state.prevWS = "";
    list.push(comment);
    markTopCommentIfNeeded(state);
}

function processSingleLineCommentToken(token, tokenText, context) {
    const { state, comments } = context;
    const comment = Core.createCommentLineNode({
        token,
        tokenText,
        leadingWS: state.prevWS,
        leadingChar: state.prevSignificantChar
    });
    registerComment(state, comments, comment);
}

function processMultiLineCommentToken(token, tokenText, context) {
    const { state, comments } = context;
    const comment = Core.createCommentBlockNode({
        token,
        tokenText,
        leadingWS: state.prevWS,
        leadingChar: state.prevSignificantChar
    });
    registerComment(state, comments, comment);
}

function processWhitespaceToken(token, tokenText, isNewline, context) {
    const { state, whitespaces } = context;
    const whitespace = Core.createWhitespaceNode({
        token,
        tokenText,
        isNewline
    });
    whitespaces.push(whitespace);

    if (state.prevComment) {
        state.prevComment.trailingWS += whitespace.value;
    }

    state.prevComment = null;
    state.prevWS += whitespace.value;
}

function recordSignificantToken(tokenText, state) {
    const text = typeof tokenText === "string" ? tokenText : "";
    state.foundFirstSignificantToken = true;

    if (state.prevComment) {
        state.prevComment.trailingChar = text;
    }

    state.prevComment = null;
    state.prevWS = "";
    state.prevSignificantChar = text.slice(-1);
}

function markEndOfFile(state) {
    state.reachedEOF = true;
    if (state.finalComment) {
        state.finalComment.isBottomComment = true;
    }
}

export function createHiddenNodeProcessor({ comments, whitespaces, lexerTokens }) {
    const state = createState();
    const tokens = lexerTokens;

    return {
        hasReachedEnd() {
            return state.reachedEOF;
        },
        processToken(token) {
            const tokenType = token?.type;

            if (tokenType === tokens.EOF) {
                markEndOfFile(state);
                return;
            }

            const tokenText = token?.text ?? "";

            if (tokenType === tokens.SingleLineComment) {
                processSingleLineCommentToken(token, tokenText, { state, comments });
                return;
            }

            if (tokenType === tokens.MultiLineComment) {
                processMultiLineCommentToken(token, tokenText, { state, comments });
                return;
            }

            if (tokenType === tokens.WhiteSpaces || tokenType === tokens.LineTerminator) {
                processWhitespaceToken(token, tokenText, tokenType === tokens.LineTerminator, { state, whitespaces });
                return;
            }

            recordSignificantToken(tokenText, state);
        }
    };
}
