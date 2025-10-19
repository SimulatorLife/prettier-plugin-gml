import antlr4 from "antlr4";
import { PredictionMode } from "antlr4";
import GameMakerLanguageLexer from "./generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "./generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "./gml-ast-builder.js";
import GameMakerParseErrorListener from "./gml-syntax-error.js";
import { getLineBreakCount } from "../../shared/utils/line-breaks.js";
import { isErrorLike } from "../../shared/utils/capability-probes.js";

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
            if (error) {
                if (isErrorLike(error)) {
                    throw error;
                }

                throw new Error(String(error));
            }
            throw new Error("Unknown syntax error while parsing GML source.");
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
            } else if (node.type === "TemplateStringText" && 
                    Number.isInteger(startIndex) &&
                    Number.isInteger(endIndex) &&
                    endIndex >= startIndex
                ) {
                    node.value = this.originalText.slice(
                        startIndex,
                        endIndex + 1
                    );
                }

            for (const value of Object.values(node)) {
                if (!value || typeof value !== "object") {
                    continue;
                }

                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (item && typeof item === "object") {
                            stack.push(item);
                        }
                    }
                    continue;
                }

                stack.push(value);
            }
        }
    }

    // populates the comments array and whitespaces array.
    // comments are annotated with surrounding whitespace and characters
    getHiddenNodes(lexer) {
        let reachedEOF = false;
        let prevComment = null;
        let finalComment = null;
        let prevWS = "";
        let prevSignificantChar = "";
        let foundFirstSignificantToken = false;

        const {
            EOF,
            SingleLineComment,
            MultiLineComment,
            WhiteSpaces,
            LineTerminator
        } = GameMakerLanguageLexer;

        const markTopCommentIfNeeded = () => {
            if (!foundFirstSignificantToken && prevComment) {
                prevComment.isTopComment = true;
                foundFirstSignificantToken = true;
            }
        };

        while (!reachedEOF) {
            const token = lexer.nextToken();

            if (token.type === EOF) {
                reachedEOF = true;
                if (finalComment) {
                    finalComment.isBottomComment = true;
                }
                continue;
            }

            const tokenText = token.text;

            if (token.type === SingleLineComment) {
                const node = {
                    type: "CommentLine",
                    value: tokenText.replace(/^[\/][\/]/, ""),
                    start: { line: token.line, index: token.start },
                    end: {
                        line: token.line,
                        index: token.stop
                    },
                    leadingWS: prevWS,
                    trailingWS: "",
                    leadingChar: prevSignificantChar,
                    trailingChar: ""
                };
                prevComment = node;
                finalComment = node;
                prevWS = "";
                this.comments.push(node);
                markTopCommentIfNeeded();
                continue;
            }

            if (token.type === MultiLineComment) {
                const lineBreakCount = getLineBreakCount(tokenText);
                const node = {
                    type: "CommentBlock",
                    value: tokenText
                        .replace(/^[\/][\*]/, "")
                        .replace(/[\*][\/]$/, ""),
                    start: { line: token.line, index: token.start },
                    end: {
                        line: token.line + lineBreakCount,
                        index: token.stop
                    },
                    lineCount: lineBreakCount + 1,
                    leadingWS: prevWS,
                    trailingWS: "",
                    leadingChar: prevSignificantChar,
                    trailingChar: ""
                };
                prevComment = node;
                finalComment = node;
                prevWS = "";
                this.comments.push(node);
                markTopCommentIfNeeded();
                continue;
            }

            if (token.type === WhiteSpaces || token.type === LineTerminator) {
                const isNewline = token.type === LineTerminator;
                const lineBreakCount = getLineBreakCount(tokenText);
                const node = {
                    type: "Whitespace",
                    value: tokenText,
                    start: { line: token.line, index: token.start },
                    end: {
                        line: token.line + lineBreakCount,
                        index: token.stop
                    },
                    line: token.line,
                    isNewline
                };
                this.whitespaces.push(node);
                if (prevComment !== null) {
                    prevComment.trailingWS += tokenText;
                }
                prevComment = null;
                prevWS += tokenText;
                continue;
            }

            // Any token that reaches this branch represents "real" syntax
            // rather than trivia. Close out the bookkeeping for any comment we
            // just saw so downstream printers can make correct decisions: once
            // we encounter significant code we stop marking subsequent
            // comments as file-level top comments, capture the adjacent token
            // text so helpers like `handleCommentInEmptyParens` know whether a
            // comment lives inside wrapping punctuation, and clear the cached
            // whitespace buffer. Skipping this reset causes later formatting
            // passes to mis-classify top/bottom comments and smear leftover
            // whitespace onto unrelated nodes.
            foundFirstSignificantToken = true;
            if (prevComment !== null) {
                prevComment.trailingChar = tokenText;
            }
            prevComment = null;
            prevWS = "";
            prevSignificantChar = tokenText.slice(-1);
        }
    }

    removeLocationInfo(obj) {
        if (!obj || typeof obj !== "object") {
            return;
        }

        for (const prop of Object.keys(obj)) {
            if (prop === "start" || prop === "end") {
                delete obj[prop];
                continue;
            }

            const value = obj[prop];
            if (value && typeof value === "object") {
                this.removeLocationInfo(value);
            }
        }
    }

    simplifyLocationInfo(obj) {
        if (!obj || typeof obj !== "object") {
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
            if (value && typeof value === "object") {
                this.simplifyLocationInfo(value);
            }
        }
    }
}

export { getLineBreakCount } from "../../shared/utils/line-breaks.js";
