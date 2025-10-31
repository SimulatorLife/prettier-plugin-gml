import antlr4, { PredictionMode } from "antlr4";

import GameMakerLanguageLexer from "../generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "../generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "./gml-ast-builder.js";
import GameMakerParseErrorListener, {
    GameMakerLexerErrorListener
} from "./gml-syntax-error.js";
import { createHiddenNodeProcessor } from "./core/hidden-node-processor.js";
import { isObjectLike, isErrorLike } from "./shared/index.js";
import { walkObjectGraph } from "./ast/object-graph.js";
import {
    removeLocationMetadata,
    simplifyLocationMetadata
} from "./ast/location-manipulation.js";
import { installRecognitionExceptionLikeGuard } from "./runtime/recognition-exception-patch.js";
import convertToESTree from "./utils/estree-converter.js";

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

function mergeParserOptions(baseOptions, overrides) {
    const overrideObject = isObjectLike(overrides) ? overrides : {};
    return Object.assign({}, baseOptions, overrideObject);
}

export default class GMLParser {
    constructor(text, options = {}) {
        this.originalText = text;
        this.text = normalizeSimpleEscapeCase(text);
        this.whitespaces = [];
        this.comments = [];
        const defaults =
            this.constructor?.optionDefaults ?? GMLParser.optionDefaults;
        this.options = mergeParserOptions(defaults, options);
    }

    static optionDefaults = Object.freeze({
        getComments: true,
        getLocations: true,
        simplifyLocations: true,
        getIdentifierMetadata: false,
        createScopeTracker: null,
        // Controls the structure of the returned AST. Use "estree" to receive
        // nodes that align with the ESTree specification used by JS tooling.
        astFormat: "gml",
        // When true the parser returns a JSON string rather than a mutable AST
        // object. This is primarily useful when paired with the ESTree output
        // to feed other tooling or persist snapshots.
        asJSON: false
    });

    static parse(text, options) {
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

        const shouldConvertToESTree =
            typeof this.options.astFormat === "string" &&
            this.options.astFormat.toLowerCase() === "estree";

        if (!this.options.getLocations) {
            this.removeLocationInfo(astTree);
        } else if (!shouldConvertToESTree && this.options.simplifyLocations) {
            this.simplifyLocationInfo(astTree);
        }

        if (this.originalText !== this.text) {
            this.restoreOriginalLiteralText(astTree);
        }

        if (shouldConvertToESTree) {
            astTree = convertToESTree(astTree, {
                includeLocations: this.options.getLocations,
                includeRange:
                    this.options.getLocations && this.options.simplifyLocations,
                includeComments: this.options.getComments
            });
        }

        if (this.options.asJSON) {
            return JSON.stringify(astTree);
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

        walkObjectGraph(root, {
            enterObject: (node) => {
                const startIndex =
                    typeof node.start === "number"
                        ? node.start
                        : node.start?.index;
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
                    return;
                }

                if (
                    node.type === "TemplateStringText" &&
                    Number.isInteger(startIndex) &&
                    Number.isInteger(endIndex) &&
                    endIndex >= startIndex
                ) {
                    node.value = this.originalText.slice(
                        startIndex,
                        endIndex + 1
                    );
                }
            }
        });
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
        removeLocationMetadata(obj);
    }

    simplifyLocationInfo(obj) {
        simplifyLocationMetadata(obj);
    }
}

export { getLineBreakCount } from "./shared/index.js";
