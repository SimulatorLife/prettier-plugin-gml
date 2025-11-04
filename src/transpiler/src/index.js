import GMLParser from "gamemaker-language-parser";
import { emitJavaScript } from "./emitter.js";

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
            // Parse the GML source code
            const parser = new GMLParser(sourceText);
            const ast = parser.parse();

            // Generate JavaScript from the AST
            const jsBody = emitJavaScript(ast);

            // Return a patch object compatible with the runtime wrapper
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
        const parser = new GMLParser(sourceText);
        const ast = parser.parse();
        return emitJavaScript(ast);
    }
}

export function createTranspiler(dependencies = {}) {
    return new GmlTranspiler(dependencies);
}
