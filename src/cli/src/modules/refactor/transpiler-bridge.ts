import type { TranspilerBridge } from "@gml-modules/refactor";
import { Transpiler } from "@gml-modules/transpiler";

/**
 * Transpiler bridge that adapts @gml-modules/transpiler to the refactor engine.
 */
export class GmlTranspilerBridge implements TranspilerBridge {
    /**
     * Transpile a script into a hot-reload compatibility patch.
     * @param request Transpilation request details
     */
    async transpileScript(request: { sourceText: string; symbolId: string }): Promise<Record<string, unknown>> {
        const { sourceText, symbolId } = request;

        // Note: For full semantic-aware transpilation, we would need a semantic oracle.
        // For rename validation purposes, a basic transpiler usually suffices.
        const transpiler = new Transpiler.GmlTranspiler();

        try {
            const result = transpiler.transpileScript({
                sourceText,
                symbolId
            });
            return {
                ...result,
                success: true
            };
        } catch (error) {
            throw new Error(`Transpilation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
