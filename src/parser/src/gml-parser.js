import antlr4, { PredictionMode } from "antlr4";

import GameMakerLanguageLexer from "../generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "../generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "./gml-ast-builder.js";
import GameMakerParseErrorListener, {
    GameMakerLexerErrorListener
} from "./gml-syntax-error.js";
import {
    enqueueObjectChildValues,
    isObjectLike,
    isErrorLike,
    getLineBreakCount
} from "./shared/index.js";
import { installRecognitionExceptionLikeGuard } from "./extensions/recognition-exception-patch.js";

installRecognitionExceptionLikeGuard();

function normalizeSimpleEscapeCase(text) {
    if (typeof text !== "string" || text.length === 0) {
        return text;
    }

    return text.replaceAll(
        /\\([bfnrtv])/gi,
        (_match, escape) => `\\${escape.toLowerCase()}`
    );
}

function isQuotedString(value) {
    if (typeof value !== "string" || value.length < 2) {
        return false;
    }

    const first = value[0];
    return (first === '"' || first === "'") && value.endsWith(first);
}

function createCommentLineNode({ token, tokenText, leadingWS, leadingChar }) {
    const value = (tokenText ?? "").replace(/^[\/][\/]/, "");

    return {
        type: "CommentLine",
        value,
        start: { line: token.line, index: token.start },
        end: { line: token.line, index: token.stop },
        leadingWS: leadingWS ?? "",
        trailingWS: "",
        leadingChar: leadingChar ?? "",
        trailingChar: ""
    };
}

function createCommentBlockNode({ token, tokenText, leadingWS, leadingChar }) {
    const text = tokenText ?? "";
    const lineBreakCount = getLineBreakCount(text);

    return {
        type: "CommentBlock",
        value: text.replace(/^[\/][\*]/, "").replace(/[\*][\/]$/, ""),
        start: { line: token.line, index: token.start },
        end: {
            line: token.line + lineBreakCount,
            index: token.stop
        },
        lineCount: lineBreakCount + 1,
        leadingWS: leadingWS ?? "",
        trailingWS: "",
        leadingChar: leadingChar ?? "",
        trailingChar: ""
    };
}

function createWhitespaceNode({ token, tokenText, isNewline }) {
    const text = tokenText ?? "";
    const lineBreakCount = getLineBreakCount(text);

    return {
        type: "Whitespace",
        value: text,
        start: { line: token.line, index: token.start },
        end: {
            line: token.line + lineBreakCount,
            index: token.stop
        },
        line: token.line,
        isNewline
    };
}

function createHiddenNodeProcessor({ comments, whitespaces, lexerTokens }) {
    const state = {
        reachedEOF: false,
        prevComment: null,
        finalComment: null,
        prevWS: "",
        prevSignificantChar: "",
        foundFirstSignificantToken: false
    };

    function markTopCommentIfNeeded() {
        if (!state.foundFirstSignificantToken && state.prevComment) {
            state.prevComment.isTopComment = true;
            state.foundFirstSignificantToken = true;
        }
    }

    function registerComment(node) {
        state.prevComment = node;
        state.finalComment = node;
        state.prevWS = "";
        comments.push(node);
        markTopCommentIfNeeded();
    }

    function handleSingleLineComment(token, tokenText) {
        const node = createCommentLineNode({
            token,
            tokenText,
            leadingWS: state.prevWS,
            leadingChar: state.prevSignificantChar
        });
        registerComment(node);
    }

    function handleMultiLineComment(token, tokenText) {
        const node = createCommentBlockNode({
            token,
            tokenText,
            leadingWS: state.prevWS,
            leadingChar: state.prevSignificantChar
        });
        registerComment(node);
    }

    function handleWhitespace(token, tokenText, isNewline) {
        const text = tokenText ?? "";
        const node = createWhitespaceNode({
            token,
            tokenText: text,
            isNewline
        });
        whitespaces.push(node);

        if (state.prevComment) {
            state.prevComment.trailingWS += text;
        }

        state.prevComment = null;
        state.prevWS += text;
    }

    function handleSignificantToken(tokenText) {
        const text = tokenText ?? "";
        state.foundFirstSignificantToken = true;
        if (state.prevComment) {
            state.prevComment.trailingChar = text;
        }
        state.prevComment = null;
        state.prevWS = "";
        state.prevSignificantChar = text.slice(-1);
    }

    function handleEOF() {
        state.reachedEOF = true;
        if (state.finalComment) {
            state.finalComment.isBottomComment = true;
        }
    }

    return {
        hasReachedEnd() {
            return state.reachedEOF;
        },
        processToken(token) {
            const tokenType = token.type;
            if (tokenType === lexerTokens.EOF) {
                handleEOF();
                return;
            }

            const tokenText = token.text ?? "";

            if (tokenType === lexerTokens.SingleLineComment) {
                handleSingleLineComment(token, tokenText);
                return;
            }

            if (tokenType === lexerTokens.MultiLineComment) {
                handleMultiLineComment(token, tokenText);
                return;
            }

            if (
                tokenType === lexerTokens.WhiteSpaces ||
                tokenType === lexerTokens.LineTerminator
            ) {
                handleWhitespace(
                    token,
                    tokenText,
                    tokenType === lexerTokens.LineTerminator
                );
                return;
            }

            handleSignificantToken(tokenText);
        }
    };
}

export default class GMLParser {
    constructor(text, options) {
        this.originalText = text;
        this.text = normalizeSimpleEscapeCase(text);
        this.whitespaces = [];
        this.comments = [];
        this.options = Object.assign({}, GMLParser.optionDefaults, options);
    }

    static optionDefaults = {
        getComments: true,
        getLocations: true,
        simplifyLocations: true,
        getIdentifierMetadata: false
    };

    static parse(
        text,
        options = {
            getComments: true,
            getLocations: true,
            simplifyLocations: true,
            getIdentifierMetadata: false
        }
    ) {
        return new this(text, options).parse();
    }

    parse() {
        const chars = new antlr4.InputStream(this.text);
        const lexer = new GameMakerLanguageLexer(chars);
        lexer.removeErrorListeners();
        lexer.addErrorListener(new GameMakerLexerErrorListener());
        lexer.strictMode = false;
        const tokens = new antlr4.CommonTokenStream(lexer);
        const parser = new GameMakerLanguageParser(tokens);

        parser._interp.predictionMode = PredictionMode.SLL;
        parser.removeErrorListeners();
        parser.addErrorListener(new GameMakerParseErrorListener());

        let tree;
        try {
            tree = parser.program();
        } catch (error) {
            if (!error) {
                throw new Error(
                    "Unknown syntax error while parsing GML source."
                );
            }

            if (isErrorLike(error)) {
                throw error;
            }

            throw new Error(String(error));
        }

        if (this.options.getComments) {
            lexer.reset();
            this.getHiddenNodes(lexer);
        }

        const builder = new GameMakerASTBuilder(this.options, this.whitespaces);
        let astTree = {};
        astTree = builder.build(tree);

        if (this.options.getComments) {
            astTree.comments = this.comments;
        }

        if (!this.options.getLocations) {
            this.removeLocationInfo(astTree);
        } else if (this.options.simplifyLocations) {
            this.simplifyLocationInfo(astTree);
        }

        if (this.originalText !== this.text) {
            this.restoreOriginalLiteralText(astTree);
        }

        return astTree;
    }

    printTokens(text) {
        console.log("===== TOKEN =====" + " ".repeat(14) + "===== TEXT =====");

        const chars = new antlr4.InputStream(text);
        const lexer = new GameMakerLanguageLexer(chars);
        lexer.strictMode = false;
        const names = GameMakerLanguageLexer.symbolicNames;

        for (
            let token = lexer.nextToken();
            token.type !== GameMakerLanguageLexer.EOF;
            token = lexer.nextToken()
        ) {
            const name = names[token.type];
            console.log(
                `${name}:${" ".repeat(29 - name.length)} '${token.text.replace("\n", String.raw`\n`)}'`
            );
        }

        console.log("");
    }

    restoreOriginalLiteralText(root) {
        if (!root || typeof root !== "object") {
            return;
        }

        const stack = [root];

        while (stack.length > 0) {
            const node = stack.pop();
            if (!node || typeof node !== "object") {
                continue;
            }

            const startIndex =
                typeof node.start === "number" ? node.start : node.start?.index;
            const endIndex =
                typeof node.end === "number" ? node.end : node.end?.index;

            if (node.type === "Literal" && isQuotedString(node.value)) {
                if (
                    Number.isInteger(startIndex) &&
                    Number.isInteger(endIndex) &&
                    endIndex >= startIndex
                ) {
                    node.value = this.originalText.slice(
                        startIndex,
                        endIndex + 1
                    );
                }
            } else if (
                node.type === "TemplateStringText" &&
                Number.isInteger(startIndex) &&
                Number.isInteger(endIndex) &&
                endIndex >= startIndex
            ) {
                node.value = this.originalText.slice(startIndex, endIndex + 1);
            }

            for (const value of Object.values(node)) {
                enqueueObjectChildValues(stack, value);
            }
        }
    }

    // Populates the comments array and whitespaces array.
    // Comments are annotated with surrounding whitespace and characters.
    getHiddenNodes(lexer) {
        const {
            EOF,
            SingleLineComment,
            MultiLineComment,
            WhiteSpaces,
            LineTerminator
        } = GameMakerLanguageLexer;
        const processor = createHiddenNodeProcessor({
            comments: this.comments,
            whitespaces: this.whitespaces,
            lexerTokens: {
                EOF,
                SingleLineComment,
                MultiLineComment,
                WhiteSpaces,
                LineTerminator
            }
        });

        while (!processor.hasReachedEnd()) {
            processor.processToken(lexer.nextToken());
        }
    }

    removeLocationInfo(obj) {
        if (!isObjectLike(obj)) {
            return;
        }

        for (const prop of Object.keys(obj)) {
            if (prop === "start" || prop === "end") {
                delete obj[prop];
                continue;
            }

            const value = obj[prop];
            if (isObjectLike(value)) {
                this.removeLocationInfo(value);
            }
        }
    }

    simplifyLocationInfo(obj) {
        if (!isObjectLike(obj)) {
            return;
        }

        for (const prop of Object.keys(obj)) {
            if (prop === "start") {
                obj.start = obj.start.index;
                continue;
            }

            if (prop === "end") {
                obj.end = obj.end.index;
                continue;
            }

            const value = obj[prop];
            if (isObjectLike(value)) {
                this.simplifyLocationInfo(value);
            }
        }
    }
}

export { getLineBreakCount } from "./shared/index.js";
