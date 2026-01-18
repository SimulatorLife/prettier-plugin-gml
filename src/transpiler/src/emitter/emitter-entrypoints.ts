import type { CallTargetAnalyzer, EmitOptions, GmlNode, IdentifierAnalyzer, IdentifierMetadata } from "./ast.js";
import { isBuiltinFunction } from "./builtins.js";
import { GmlToJsEmitter } from "./emitter.js";
import { createSemanticOracle } from "./semantic-factory.js";

type StatementLike = GmlNode | undefined | null;
type SemanticInput =
    | (IdentifierAnalyzer & CallTargetAnalyzer)
    | {
          identifier: IdentifierAnalyzer;
          callTarget: CallTargetAnalyzer;
      };

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

/**
 * Create a minimal dummy oracle for testing or scenarios where semantic
 * analysis is not needed. This oracle has no knowledge of built-ins or
 * scripts and classifies everything as local or unknown.
 *
 * @deprecated Use `createSemanticOracle()` instead for better code
 * generation with proper semantic analysis.
 */
export function makeDummyOracle(): {
    identifier: IdentifierAnalyzer;
    callTarget: CallTargetAnalyzer;
} {
    const identifierAnalyzer: IdentifierAnalyzer = {
        kindOfIdent(node) {
            if (!node) {
                return "local";
            }
            if (node.isGlobalIdentifier) {
                return "global_field";
            }
            return "local";
        },
        nameOfIdent(node) {
            return node?.name ?? "";
        },
        qualifiedSymbol() {
            return null;
        }
    };

    const callTargetAnalyzer: CallTargetAnalyzer = {
        callTargetKind(node) {
            const calleeName =
                node.object && typeof (node.object as IdentifierMetadata).name === "string"
                    ? (node.object as IdentifierMetadata).name
                    : null;
            if (calleeName && isBuiltinFunction(calleeName)) {
                return "builtin";
            }
            return "unknown";
        },
        callTargetSymbol() {
            return null;
        }
    };

    return {
        identifier: identifierAnalyzer,
        callTarget: callTargetAnalyzer
    };
}
