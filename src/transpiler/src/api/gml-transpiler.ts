import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";

import {
    type CallTargetAnalyzer,
    type EmitOptions,
    type FunctionDeclarationNode,
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
    /**
     * Pre-parsed AST to reuse instead of parsing sourceText again.
     * When provided, parsing is skipped and this AST is used directly.
     * This eliminates redundant parsing when the caller has already parsed the source.
     */
    readonly ast?: unknown;
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
    private readonly fallbackSemantic: {
        identifier: IdentifierAnalyzer;
        callTarget: CallTargetAnalyzer;
    };

    constructor(dependencies: TranspilerDependencies = {}) {
        this.semantic = dependencies.semantic;
        this.emitterOptions = dependencies.emitterOptions;
        this.fallbackSemantic = makeDummyOracle();
    }

    private getSemanticAnalyzers(): {
        identifier: IdentifierAnalyzer;
        callTarget: CallTargetAnalyzer;
    } {
        return this.semantic ?? this.fallbackSemantic;
    }

    private parseProgram(sourceText: string) {
        const parser = new Parser.GMLParser(sourceText, {});
        return parser.parse();
    }

    private emitFunctionParameterUnpacking(func: FunctionDeclarationNode, emitter: GmlToJsEmitter): string {
        let unpacked = "";

        for (let index = 0; index < func.params.length; index += 1) {
            const parameter = func.params[index];
            let line = "";

            if (typeof parameter === "string") {
                continue;
            }

            if (parameter.type === "Identifier") {
                line = `var ${parameter.name} = args[${index}];`;
            } else if (parameter.type === "DefaultParameter" && parameter.left.type === "Identifier") {
                const name = parameter.left.name;
                if (parameter.right) {
                    const defaultValue = emitter.emit(parameter.right);
                    line = `var ${name} = args[${index}] === undefined ? ${defaultValue} : args[${index}];`;
                } else {
                    line = `var ${name} = args[${index}];`;
                }
            }

            if (!line) {
                continue;
            }

            unpacked = unpacked ? `${unpacked}\n${line}` : line;
        }

        return unpacked;
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
            const ast = request.ast ?? this.parseProgram(sourceText);
            const emitter = new GmlToJsEmitter(this.getSemanticAnalyzers(), this.emitterOptions);
            let jsBody = "";

            // Special handling for GML 2.3+ scripts that contain a single function declaration.
            // When hot-reloading, we want to execute the function body immediately when the patch is applied,
            // rather than just defining the function in the local scope.
            // We unwrap the function, generating code to unpack 'args' into the named parameters,
            // and then emit the body of the function.
            if (ast.body.length === 1 && ast.body[0].type === "FunctionDeclaration") {
                const func = ast.body[0] as unknown as FunctionDeclarationNode;
                const paramUnpacking = this.emitFunctionParameterUnpacking(func, emitter);

                const bodyRaw = emitter.emit(func.body).trim();
                // Strip surrounding braces if present (BlockStatement)
                const bodyContent =
                    bodyRaw.startsWith("{") && bodyRaw.endsWith("}") ? bodyRaw.slice(1, -1).trim() : bodyRaw;

                jsBody = paramUnpacking ? `${paramUnpacking}\n${bodyContent}` : bodyContent;
            } else {
                jsBody = emitter.emit(ast);
            }

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
            const emitter = new GmlToJsEmitter(this.getSemanticAnalyzers(), this.emitterOptions);
            return emitter.emit(ast);
        } catch (error) {
            const message = Core.isErrorLike(error) ? error.message : String(error);
            throw new Error(`Failed to transpile expression: ${message}`, {
                cause: Core.isErrorLike(error) ? error : undefined
            });
        }
    }
}
