/**
 * GML → JavaScript transpiler.
 * Converts GML source code into JavaScript that can be executed in the runtime wrapper.
 */
export declare class GmlTranspiler {
    constructor({ parser, semantic, shared }?: {});
    /**
     * Transpile a GML script to JavaScript
     * @param {Object} request - Transpilation request
     * @param {string} request.sourceText - GML source code
     * @param {string} request.symbolId - Symbol identifier for the script
     * @returns {Promise<Object>} Patch object with transpiled JavaScript
     */
    transpileScript(request: any): Promise<{
        kind: string;
        id: any;
        js_body: any;
        sourceText: string;
        version: number;
    }>;
    /**
     * Create a minimal transpiler for testing
     * @param {string} sourceText - GML source code
     * @returns {string} Generated JavaScript code
     */
    transpileExpression(sourceText: any): any;
}
export declare function createTranspiler(dependencies?: {}): GmlTranspiler;
