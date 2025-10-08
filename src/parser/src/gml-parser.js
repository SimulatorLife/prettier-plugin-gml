import antlr4 from "antlr4";
import { PredictionMode } from "antlr4";
import GameMakerLanguageLexer from "./generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "./generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "./gml-ast-builder.js";
import GameMakerParseErrorListener from "./gml-syntax-error.js";
import { getLineBreakCount } from "../../shared/line-breaks.js";

export default class GMLParser {
    constructor(text, options) {
        this.text = text;
        this.whitespaces = [];
        this.comments = [];
        this.options = Object.assign({}, GMLParser.optionDefaults, options);
    }

    static optionDefaults = {
        getComments: true,
        getLocations: true,
        simplifyLocations: true
    };

    static parse(
        text,
        options = {
            getComments: true,
            getLocations: true,
            simplifyLocations: true
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

        try {
            var tree = parser.program();
        } catch (error) {
            if (error) {
                const normalisedError =
                    error instanceof Error ? error : new Error(String(error));
                throw normalisedError;
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
            token.type != GameMakerLanguageLexer.EOF;
            token = lexer.nextToken()
        ) {
            const name = names[token.type];
            console.log(
                `${name}:${" ".repeat(29 - name.length)} '${token.text.replace("\n", "\\n")}'`
            );
        }

        console.log("");
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

            if (token.type === SingleLineComment) {
                let node = {
                    type: "CommentLine",
                    value: token.text.replace(/^[\/][\/]/, ""),
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
                let node = {
                    type: "CommentBlock",
                    value: token.text.replace(/^[\/][\*]/, "").replace(/[\*][\/]$/, ""),
                    start: { line: token.line, index: token.start },
                    end: {
                        line: token.line + getLineBreakCount(token.text),
                        index: token.stop
                    },
                    lineCount: getLineBreakCount(token.text) + 1,
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
                let node = {
                    type: "Whitespace",
                    value: token.text,
                    start: { line: token.line, index: token.start },
                    end: {
                        line: token.line + getLineBreakCount(token.text),
                        index: token.stop
                    },
                    line: token.line,
                    isNewline: isNewline
                };
                this.whitespaces.push(node);
                if (prevComment !== null) {
                    prevComment.trailingWS += token.text;
                }
                prevComment = null;
                prevWS += token.text;
                continue;
            }

            // significant token
            foundFirstSignificantToken = true;
            if (prevComment !== null) {
                prevComment.trailingChar = token.text.slice(0);
            }
            prevComment = null;
            prevWS = "";
            prevSignificantChar = token.text.slice(-1);
        }
    }

    removeLocationInfo(obj) {
        for (const prop in obj) {
            if (prop === "start" || prop === "end") {
                delete obj[prop];
            } else if (typeof obj[prop] === "object") {
                this.removeLocationInfo(obj[prop]);
            }
        }
    }

    simplifyLocationInfo(obj) {
        for (const prop in obj) {
            if (prop === "start") {
                obj.start = obj.start.index;
            } else if (prop === "end") {
                obj.end = obj.end.index;
            } else if (typeof obj[prop] === "object") {
                this.simplifyLocationInfo(obj[prop]);
            }
        }
    }
}

export { getLineBreakCount };