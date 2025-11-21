import { Parser } from "@gml-modules/parser";
import { GmlToJsEmitter, makeDummyOracle } from "./emitter.js";

/**
 * GML → JavaScript transpiler.
 * Converts GML source code into JavaScript that can be executed in the runtime wrapper.
 */
export class GmlTranspiler {
    constructor({ parser, semantic, shared } = {}) {
        this.parser = parser;
        this.semantic = semantic;
        this.shared = shared;
    }

    /**
     * Transpile a GML script to JavaScript
     * @param {Object} request - Transpilation request
     * @param {string} request.sourceText - GML source code
     * @param {string} request.symbolId - Symbol identifier for the script
     * @returns {Promise<Object>} Patch object with transpiled JavaScript
     */
    async transpileScript(request) {
        const { sourceText, symbolId } = request ?? {};
        if (typeof sourceText !== "string" || !symbolId) {
            throw new TypeError(
                "transpileScript requires sourceText and symbolId"
            );
        }

        try {
            // Parse the GML source code into an abstract syntax tree (AST) using the
            // GML parser. This AST captures the script's structure in a format that
            // the JavaScript emitter can traverse and transform.
            const parser = new Parser.GMLParser(sourceText, {
                getIdentifierMetadata: true
            });
            const ast = parser.parse();

            // Generate JavaScript code from the AST by walking the tree and emitting
            // equivalent JavaScript constructs. The emitter handles GML-specific
            // operators, control flow, and syntax that differ from JavaScript.
            const oracle = this.semantic || makeDummyOracle();
            const emitter = new GmlToJsEmitter(oracle);
            const jsBody = emitter.emit(ast);

            // Return a hot-reload patch object containing the transpiled JavaScript
            // body, the original GML source (for debugging), and a version timestamp.
            // The runtime wrapper expects this shape when applying live updates to
            // running scripts without restarting the GameMaker runtime.
            return {
                kind: "script",
                id: symbolId,
                js_body: jsBody,
                sourceText,
                version: Date.now()
            };
        } catch (error) {
            throw new Error(
                `Failed to transpile script ${symbolId}: ${error.message}`
            );
        }
    }

    /**
     * Create a minimal transpiler for testing
     * @param {string} sourceText - GML source code
     * @returns {string} Generated JavaScript code
     */
    transpileExpression(sourceText) {
        const parser = new Parser.GMLParser(sourceText);
        const ast = parser.parse();
        const oracle = this.semantic || makeDummyOracle();
        const emitter = new GmlToJsEmitter(oracle);
        return emitter.emit(ast);
    }
}

export function createTranspiler(dependencies = {}) {
    return new GmlTranspiler(dependencies);
}
