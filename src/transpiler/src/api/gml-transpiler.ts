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

/**
 * Request parameters for transpiling a GML object event body.
 *
 * Object events (Create, Step, Draw, etc.) are raw GML statement sequences—
 * they are not wrapped in an explicit function declaration. The transpiled
 * `js_body` is intended for the runtime wrapper's `EventPatch`, which executes
 * the body inside `new Function("self", argsDecl, js_body)`.
 */
export interface TranspileEventRequest {
    /**
     * Absolute or workspace-relative path to the GML source file for diagnostics.
     */
    readonly sourcePath?: string;
    /** Raw GML source text for the event body. */
    readonly sourceText: string;
    /** SCIP-style symbol identifier, e.g. `"gml/event/obj_player/Create_0"`. */
    readonly symbolId: string;
    /**
     * Pre-parsed AST to reuse instead of parsing `sourceText` again.
     * Useful for callers that have already parsed the source (e.g., the CLI
     * watcher) to avoid redundant parsing overhead.
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

/**
 * A patch object produced by transpiling a GML object event body.
 *
 * Compatible with the runtime wrapper's `EventPatch` type. The `js_body`
 * uses explicit `self.` prefixes for instance-variable access so it runs
 * correctly inside `new Function("self", argsDecl, js_body)` without
 * requiring the GML proxy `with`-wrapper that script patches rely on.
 */
export interface EventPatch {
    readonly kind: "event";
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
            const ast =
                request.ast ??
                (() => {
                    const parser = new Parser.GMLParser(sourceText, {});
                    return parser.parse();
                })();
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

    /**
     * Transpile a GML object event body into an `EventPatch`.
     *
     * Unlike `transpileScript`, event bodies are never wrapped in an explicit
     * function declaration, and the resulting `js_body` is executed inside
     * `new Function("self", argsDecl, js_body)` without the GML proxy
     * `with`-wrapper. Therefore the emitter is configured with
     * `emitSelfPrefix: true` so that instance-variable accesses are emitted
     * as explicit `self.<name>` references.
     *
     * @example
     * ```typescript
     * const transpiler = new GmlTranspiler();
     * const patch = transpiler.transpileEvent({
     *   sourceText: "x += speed;\nif (hp <= 0) { instance_destroy(); }",
     *   symbolId: "gml/event/obj_player/Step_0",
     * });
     * // patch.js_body ≈ "self.x += self.speed;\nif ((self.hp <= 0)) { instance_destroy(); }"
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
            const ast =
                request.ast ??
                (() => {
                    const parser = new Parser.GMLParser(sourceText, {});
                    return parser.parse();
                })();
            const oracle = this.semantic ?? makeDummyOracle();
            // Events run without the GML proxy `with`-wrapper, so instance variables
            // must be emitted with an explicit `self.` prefix.
            const emitter = new GmlToJsEmitter(oracle, {
                ...this.emitterOptions,
                emitSelfPrefix: true
            });
            const jsBody = emitter.emit(ast);
            const timestamp = Date.now();
            const patch: EventPatch = {
                kind: "event",
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
            throw new Error(`Failed to transpile event ${symbolId}: ${message}`, {
                cause: Core.isErrorLike(error) ? error : undefined
            });
        }
    }
}
