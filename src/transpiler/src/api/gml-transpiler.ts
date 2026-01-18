import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";

import {
    type CallTargetAnalyzer,
    type EmitOptions,
    GmlToJsEmitter,
    type IdentifierAnalyzer,
    makeDummyOracle
} from "../emitter/index.js";

export interface TranspileScriptRequest {
    /**
     * Absolute or workspace-relative file path that produced the source.
     * This is surfaced in patch metadata for runtime diagnostics.
     */
    readonly sourcePath?: string;
    readonly sourceText: string;
    readonly symbolId: string;
}

export interface PatchMetadata {
    readonly timestamp: number;
    readonly sourcePath?: string;
}

export interface ScriptPatch {
    readonly kind: "script";
    readonly id: string;
    readonly js_body: string;
    readonly sourceText: string;
    readonly version: number;
    readonly metadata?: PatchMetadata;
}

export interface TranspilerDependencies {
    readonly semantic?: {
        identifier: IdentifierAnalyzer;
        callTarget: CallTargetAnalyzer;
    };
    readonly emitterOptions?: Partial<EmitOptions>;
}

export class GmlTranspiler {
    private readonly semantic?: {
        identifier: IdentifierAnalyzer;
        callTarget: CallTargetAnalyzer;
    };
    private readonly emitterOptions?: Partial<EmitOptions>;

    constructor(dependencies: TranspilerDependencies = {}) {
        this.semantic = dependencies.semantic;
        this.emitterOptions = dependencies.emitterOptions;
    }

    transpileScript(request: TranspileScriptRequest): ScriptPatch {
        if (!request || typeof request !== "object") {
            throw new TypeError("transpileScript requires a request object");
        }
        const { sourceText, symbolId } = request;
        const sourcePath = request.sourcePath;
        if (typeof sourceText !== "string" || sourceText.length === 0) {
            throw new TypeError("transpileScript requires a sourceText string");
        }
        if (typeof symbolId !== "string" || symbolId.length === 0) {
            throw new TypeError("transpileScript requires a symbolId string");
        }
        if (sourcePath !== undefined && (typeof sourcePath !== "string" || sourcePath.length === 0)) {
            throw new TypeError("transpileScript requires sourcePath to be a non-empty string when provided");
        }

        try {
            const parser = new Parser.GMLParser(sourceText, {});
            const ast = parser.parse();
            const oracle = this.semantic ?? makeDummyOracle();
            const emitter = new GmlToJsEmitter(oracle, this.emitterOptions);
            const jsBody = emitter.emit(ast);
            const timestamp = Date.now();
            const patch: ScriptPatch = {
                kind: "script",
                id: symbolId,
                js_body: jsBody,
                sourceText,
                version: timestamp,
                metadata: {
                    ...(sourcePath ? { sourcePath } : {}),
                    timestamp
                }
            };
            return patch;
        } catch (error) {
            const message = Core.isErrorLike(error) ? error.message : String(error);
            throw new Error(`Failed to transpile script ${symbolId}: ${message}`, {
                cause: Core.isErrorLike(error) ? error : undefined
            });
        }
    }

    transpileExpression(sourceText: string): string {
        if (typeof sourceText !== "string" || sourceText.length === 0) {
            throw new TypeError("transpileExpression requires a sourceText string");
        }

        try {
            const parser = new Parser.GMLParser(sourceText);
            const ast = parser.parse();
            const oracle = this.semantic ?? makeDummyOracle();
            const emitter = new GmlToJsEmitter(oracle, this.emitterOptions);
            return emitter.emit(ast);
        } catch (error) {
            const message = Core.isErrorLike(error) ? error.message : String(error);
            throw new Error(`Failed to transpile expression: ${message}`, {
                cause: Core.isErrorLike(error) ? error : undefined
            });
        }
    }
}
