import antlr4 from "antlr4";

import GameMakerLanguageLexer from "../generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "../generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "./ast/gml-ast-builder.js";
import { applyTransforms } from "./transforms/index.js";
import GameMakerParseErrorListener, {
    GameMakerLexerErrorListener
} from "./ast/gml-syntax-error.js";
import { createHiddenNodeProcessor } from "./ast/hidden-node-processor.js";
import { Core } from "@gml-modules/core";
import {
    removeLocationMetadata,
    simplifyLocationMetadata
} from "./ast/location-manipulation.js";
import { installRecognitionExceptionLikeGuard } from "./runtime/index.js";
import convertToESTree from "./utils/estree-converter.js";
import type { ParserOptions } from "./types/index.js";

const PredictionMode =
    (antlr4 as unknown as { atn?: { PredictionMode: unknown } }).atn
        ?.PredictionMode ??
    (antlr4 as any).PredictionMode ??
    (antlr4 as any).atn?.PredictionMode;

installRecognitionExceptionLikeGuard();

function mergeParserOptions(
    baseOptions: ParserOptions,
    overrides: Partial<ParserOptions> | undefined
): ParserOptions {
    const overrideObject = Core.Utils.isObjectLike(overrides) ? overrides : {};
    return Object.assign({}, baseOptions, overrideObject) as ParserOptions;
}

export default class GMLParser {
    public originalText: string;
    public text: string;
    public whitespaces: Array<unknown>;
    public comments: Array<unknown>;
    public options: ParserOptions;

    constructor(text: string, options: Partial<ParserOptions> = {}) {
        this.originalText = text;
        this.text = Core.Utils.normalizeSimpleEscapeCase(text);
        this.whitespaces = [];
        this.comments = [];
        const parserConstructor =
            (this.constructor as typeof GMLParser | undefined) ?? GMLParser;
        this.options = mergeParserOptions(
            parserConstructor.optionDefaults,
            options
        );
    }

    static optionDefaults: ParserOptions = Object.freeze({
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
    }) as ParserOptions;

    static parse(text: string, options?: Partial<ParserOptions>) {
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

            if (Core.Utils.isErrorLike(error)) {
                throw error;
            }

            throw new Error(String(error));
        }

        if (this.options.getComments) {
            lexer.reset();
            this.getHiddenNodes(lexer);
        }

        const builder = new GameMakerASTBuilder(this.options, this.whitespaces);
        let astTree;
        astTree = builder.build(tree);

        if (this.options.getComments) {
            astTree.comments = this.comments;
        }

        // Optionally apply parser-level transforms (internal opt-in).
        if (
            Array.isArray(this.options.transforms) &&
            this.options.transforms.length > 0
        ) {
            astTree = applyTransforms(
                astTree,
                this.options.transforms,
                this.options.transformOptions || {}
            );
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
        console.log(`===== TOKEN =====${" ".repeat(14)}===== TEXT =====`);

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

        const getIndex = (
            node: Record<string, unknown>,
            prop: "start" | "end"
        ) => {
            const value = node[prop];
            if (typeof value === "number") return value as number;
            if (value && typeof (value as any).index === "number") {
                return (value as any).index as number;
            }
            return undefined;
        };

        Core.AST.walkObjectGraph(root, {
            enterObject: (node) => {
                const startIndex = getIndex(node, "start");
                const endIndex = getIndex(node, "end");

                if (
                    node.type === "Literal" &&
                    Core.Utils.isQuotedString(node.value)
                ) {
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

export const getLineBreakCount = Core.Utils.getLineBreakCount;
