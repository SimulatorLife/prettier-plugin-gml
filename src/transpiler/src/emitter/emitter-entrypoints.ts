import type { CallTargetAnalyzer, EmitOptions, GmlNode, IdentifierAnalyzer } from "./ast.js";
import { GmlToJsEmitter } from "./emitter.js";
import { createSemanticOracle } from "./semantic-factory.js";

type StatementLike = GmlNode | undefined | null;
type SemanticInput = IdentifierAnalyzer & CallTargetAnalyzer;

/**
 * Emit JavaScript from a GML AST using the transpiler emitter.
 *
 * @param ast - AST node to emit.
 * @param sem - Optional semantic oracle/analyzers for identifier and call analysis.
 * @param options - Optional emitter options to override defaults.
 * @returns JavaScript code for the AST.
 */
export function emitJavaScript(ast: StatementLike, sem?: SemanticInput, options: Partial<EmitOptions> = {}): string {
    const oracle = sem ?? createSemanticOracle();
    const emitter = new GmlToJsEmitter(oracle, options);
    return emitter.emit(ast);
}
