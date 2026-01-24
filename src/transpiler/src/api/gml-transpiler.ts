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
            let jsBody = "";

            // Special handling for GML 2.3+ scripts that contain a single function declaration.
            // When hot-reloading, we want to execute the function body immediately when the patch is applied,
            // rather than just defining the function in the local scope.
            // We unwrap the function, generating code to unpack 'args' into the named parameters,
            // and then emit the body of the function.
            if (ast.body.length === 1 && ast.body[0].type === "FunctionDeclaration") {
                const func = ast.body[0] as unknown as FunctionDeclarationNode;
                const params = func.params || [];
                const paramLines = params.map((p, i) => {
                    if (typeof p === "string") {
                        // Should not happen in AST, params are nodes
                        return null;
                    }
                    if (p.type === "Identifier") {
                        return `var ${p.name} = args[${i}];`;
                    }
                    if (p.type === "DefaultParameter") {
                        const left = p.left;
                        if (left.type === "Identifier") {
                            const name = left.name;
                            if (p.right) {
                                const defaultVal = emitter.emit(p.right);
                                return `var ${name} = args[${i}] === undefined ? ${defaultVal} : args[${i}];`;
                            }
                            return `var ${name} = args[${i}];`;
                        }
                    }
                    return null;
                });
                const paramUnpacking = Core.compactArray(paramLines).join("\n");

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
