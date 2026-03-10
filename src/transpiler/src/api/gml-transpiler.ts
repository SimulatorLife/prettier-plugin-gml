import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";

import {
    type CallTargetAnalyzer,
    collectLocalVariables,
    createSemanticOracle,
    type EmitOptions,
    EventContextOracle,
    type FunctionDeclarationNode,
    GmlToJsEmitter,
    type IdentifierAnalyzer,
    type ProgramNode
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

export interface TranspileEventRequest {
    /**
     * Absolute or workspace-relative file path that produced the source.
     * Surfaced in patch metadata for runtime diagnostics.
     */
    readonly sourcePath?: string;
    readonly sourceText: string;
    readonly symbolId: string;
    /**
     * Pre-parsed AST to reuse instead of re-parsing `sourceText`.
     * Eliminates redundant parsing when the caller already has the AST.
     */
    readonly ast?: unknown;
    /**
     * Name to use as the `this` binding in the emitted patch.
     * Defaults to `"self"` when not provided.
     */
    readonly thisName?: string;
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

export interface EventPatch {
    readonly kind: "event";
    readonly id: string;
    readonly js_body: string;
    readonly sourceText: string;
    readonly version: number;
    /**
     * The name used as the `this` binding for the event body.
     * Always `"self"` in standard GameMaker HTML5 export code.
     */
    readonly this_name: string;
    readonly metadata?: PatchMetadata;
}

export interface TranspilerDependencies {
    readonly semantic?: IdentifierAnalyzer & CallTargetAnalyzer;
    readonly emitterOptions?: Partial<EmitOptions>;
}

export class GmlTranspiler {
    private readonly semantic?: IdentifierAnalyzer & CallTargetAnalyzer;
    private readonly emitterOptions?: Partial<EmitOptions>;
    private readonly fallbackSemantic: IdentifierAnalyzer & CallTargetAnalyzer;

    constructor(dependencies: TranspilerDependencies = {}) {
        this.semantic = dependencies.semantic;
        this.emitterOptions = dependencies.emitterOptions;
        this.fallbackSemantic = createSemanticOracle();
    }

    private getSemanticAnalyzers(): IdentifierAnalyzer & CallTargetAnalyzer {
        return this.semantic ?? this.fallbackSemantic;
    }

    private parseProgram(sourceText: string) {
        const parser = new Parser.GMLParser(sourceText, {});
        return parser.parse();
    }

    private resolveProgramAst(request: TranspileScriptRequest): ProgramNode {
        const astCandidate = request.ast ?? this.parseProgram(request.sourceText);
        if (!Core.isObjectLike(astCandidate)) {
            throw new TypeError("transpileScript requires ast to be a Program-like object when provided");
        }

        const astRecord = astCandidate as Record<string, unknown>;
        if (!Array.isArray(astRecord.body)) {
            throw new TypeError("transpileScript requires ast.body to be an array when ast is provided");
        }

        return astCandidate as ProgramNode;
    }

    private emitFunctionParameterUnpacking(func: FunctionDeclarationNode, emitter: GmlToJsEmitter): string {
        const lines: string[] = [];

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

            lines.push(line);
        }

        return lines.join("\n");
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
            const ast = this.resolveProgramAst(request);
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

    /**
     * Transpile a GML object event body into an `EventPatch`.
     *
     * Object events in GameMaker are plain statement sequences (no wrapping
     * function declaration) that execute in the context of a specific object
     * instance. Identifier resolution follows these rules:
     *
     *   - `var`-declared names in the event body → local variables (bare JS names)
     *   - All other undeclared identifiers → instance fields (emitted as `self.<name>`)
     *   - Built-in functions (abs, sqrt, etc.) → emitted as bare calls
     *   - Known scripts → routed through the hot-reload runtime wrapper
     *
     * @example
     * ```typescript
     * const patch = transpiler.transpileEvent({
     *   sourceText: "var spd = 5; x += spd; health -= 1;",
     *   symbolId: "gml/event/obj_player/create"
     * });
     * // patch.js_body ≈ "var spd = 5; x += spd; self.health -= 1;"
     * //                              ^^^^ local   ^^^^^^^^^^^^ self field
     * ```
     */
    transpileEvent(request: TranspileEventRequest): EventPatch {
        if (!request || typeof request !== "object") {
            throw new TypeError("transpileEvent requires a request object");
        }
        const { sourceText, symbolId } = request;
        const sourcePath = request.sourcePath;
        if (typeof sourceText !== "string" || sourceText.length === 0) {
            throw new TypeError("transpileEvent requires a sourceText string");
        }
        if (typeof symbolId !== "string" || symbolId.length === 0) {
            throw new TypeError("transpileEvent requires a symbolId string");
        }
        if (sourcePath !== undefined && (typeof sourcePath !== "string" || sourcePath.length === 0)) {
            throw new TypeError("transpileEvent requires sourcePath to be a non-empty string when provided");
        }

        try {
            const ast = this.resolveProgramAst(request);

            // Pre-collect var-declared locals before building the oracle so the
            // EventContextOracle can distinguish them from instance fields.
            const localVars = collectLocalVariables(ast);
            const eventOracle = new EventContextOracle(this.getSemanticAnalyzers(), localVars);
            const emitter = new GmlToJsEmitter(eventOracle, this.emitterOptions);
            const jsBody = emitter.emit(ast);

            const timestamp = Date.now();
            const patch: EventPatch = {
                kind: "event",
                id: symbolId,
                js_body: jsBody,
                sourceText,
                version: timestamp,
                this_name: request.thisName ?? "self",
                metadata: {
                    ...(sourcePath ? { sourcePath } : {}),
                    timestamp
                }
            };
            return patch;
        } catch (error) {
            const message = Core.isErrorLike(error) ? error.message : String(error);
            throw new Error(`Failed to transpile event ${symbolId}: ${message}`, {
                cause: Core.isErrorLike(error) ? error : undefined
            });
        }
    }
}
