import { Parser } from "@gml-modules/parser";
import { Core } from "@gml-modules/core";
import {
    GmlToJsEmitter,
    makeDummyOracle,
    type EmitOptions,
    type IdentifierAnalyzer,
    type CallTargetAnalyzer
} from "../emitter/index.js";

export interface TranspileScriptRequest {
    readonly sourceText: string;
    readonly symbolId: string;
}

export interface ScriptPatch {
    readonly kind: "script";
    readonly id: string;
    readonly js_body: string;
    readonly sourceText: string;
    readonly version: number;
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
        if (typeof sourceText !== "string" || sourceText.length === 0) {
            throw new TypeError("transpileScript requires a sourceText string");
        }
        if (typeof symbolId !== "string" || symbolId.length === 0) {
            throw new TypeError("transpileScript requires a symbolId string");
        }

        try {
            const parser = new Parser.GMLParser(sourceText, {});
            const ast = parser.parse();
            const oracle = this.semantic ?? makeDummyOracle();
            const emitter = new GmlToJsEmitter(oracle, this.emitterOptions);
            const jsBody = emitter.emit(ast);
            const patch: ScriptPatch = {
                kind: "script",
                id: symbolId,
                js_body: jsBody,
                sourceText,
                version: Date.now()
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
        const parser = new Parser.GMLParser(sourceText);
        const ast = parser.parse();
        const oracle = this.semantic ?? makeDummyOracle();
        const emitter = new GmlToJsEmitter(oracle, this.emitterOptions);
        return emitter.emit(ast);
    }
}
