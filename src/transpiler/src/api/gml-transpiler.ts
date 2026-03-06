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

/**
 * Request parameters for transpiling a GML object event to a JavaScript patch.
 *
 * Object events differ from scripts in two ways:
 *  1. They do not have a top-level function wrapper — the source is a bare
 *     sequence of statements.
 *  2. Identifiers that are not locally declared (via `var`) are instance fields
 *     accessed through the implicit `self` reference. The transpiler emits
 *     `self.<name>` for those identifiers so the generated JavaScript is correct
 *     in the event wrapper (which does not use `with`).
 */
export interface TranspileEventRequest {
    /**
     * Absolute or workspace-relative file path that produced the source.
     * Surfaced in patch metadata for runtime diagnostics.
     */
    readonly sourcePath?: string;
    /** Raw GML source text for the event body. */
    readonly sourceText: string;
    /**
     * SCIP-style symbol identifier for this event patch, e.g.
     * `"gml/event/obj_player/Step_0"`.
     */
    readonly symbolId: string;
    /**
     * Pre-parsed AST to reuse instead of re-parsing `sourceText`.
     * When provided, parsing is skipped and this AST is used directly.
     */
    readonly ast?: unknown;
    /**
     * Name used to reference the instance object inside the generated function.
     * Defaults to `"self"` to match GML's implicit instance reference convention.
     * The runtime wrapper binds the GameMaker instance to this parameter name.
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

/**
 * A JavaScript patch for a GML object event, compatible with the runtime
 * wrapper's `EventPatch` interface.
 *
 * The `js_body` is executed inside a function whose first parameter is the
 * instance (`this_name`, default `"self"`). Identifiers classified as instance
 * fields are emitted as `self.<name>` so they resolve correctly without needing
 * a `with` wrapper.
 */
export interface EventPatch {
    readonly kind: "event";
    readonly id: string;
    readonly js_body: string;
    readonly this_name: string;
    readonly sourceText: string;
    readonly version: number;
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

    private parseProgram(sourceText: string): unknown {
        const parser = new Parser.GMLParser(sourceText, {});
        return parser.parse() as unknown;
    }

    private resolveProgramAst(request: TranspileScriptRequest | TranspileEventRequest): ProgramNode {
        const astCandidate = request.ast ?? this.parseProgram(request.sourceText);
        if (!Core.isObjectLike(astCandidate)) {
            throw new TypeError("requires ast to be a Program-like object when provided");
        }

        const astRecord = astCandidate as Record<string, unknown>;
        if (!Array.isArray(astRecord.body)) {
            throw new TypeError("requires ast.body to be an array when ast is provided");
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

    /**
     * Emit the JavaScript body for a GML script.
     *
     * For GML 2.3+ scripts that consist of a single top-level function
     * declaration, unwraps the function so the body can be hot-reloaded
     * directly. Parameters are unpacked from the `args` array at the
     * start of the body.
     *
     * For all other scripts, emits the program directly.
     */
    private emitScriptBody(ast: ProgramNode, emitter: GmlToJsEmitter): string {
        if (ast.body.length !== 1 || ast.body[0].type !== "FunctionDeclaration") {
            return emitter.emit(ast);
        }

        // Unwrap the single function declaration for hot-reload execution.
        const func = ast.body[0] as unknown as FunctionDeclarationNode;
        const paramUnpacking = this.emitFunctionParameterUnpacking(func, emitter);
        const bodyRaw = emitter.emit(func.body).trim();
        // Strip surrounding braces from the emitted BlockStatement.
        const bodyContent = bodyRaw.startsWith("{") && bodyRaw.endsWith("}") ? bodyRaw.slice(1, -1).trim() : bodyRaw;

        return paramUnpacking ? `${paramUnpacking}\n${bodyContent}` : bodyContent;
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
            const jsBody = this.emitScriptBody(ast, emitter);

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

    /**
     * Transpile a GML object event body into a JavaScript `EventPatch` for
     * hot-reload delivery to the runtime wrapper.
     *
     * Unlike `transpileScript`, this method:
     *  - Does **not** unwrap a top-level function declaration.
     *  - Pre-walks the AST to collect `var`-declared local variable names.
     *  - Wraps the base semantic oracle with an `EventContextOracle` that
     *    promotes unresolved identifiers to `self_field`, causing the emitter
     *    to generate `self.<name>` for instance variables.
     *
     * The resulting `js_body` is suitable for use with the runtime wrapper's
     * `applyEventPatch` which creates a `new Function(thisName, body)` and
     * calls it bound to the current instance.
     *
     * @param request - Event transpilation request including source, symbol ID,
     *                  and optional `thisName` override (default `"self"`).
     * @returns An `EventPatch` object ready for broadcast to the runtime wrapper.
     * @throws `TypeError` for invalid or missing request fields.
     * @throws `Error` wrapping any parse or emit failure.
     *
     * @example
     * ```typescript
     * const transpiler = new GmlTranspiler();
     * const patch = transpiler.transpileEvent({
     *   sourceText: "var speed = 5;\nx += speed;\ny += speed;",
     *   symbolId: "gml/event/obj_player/Step_0"
     * });
     * // patch.js_body:
     * // "var speed = 5;\nself.x += speed;\nself.y += speed;"
     * ```
     */
    transpileEvent(request: TranspileEventRequest): EventPatch {
        if (!request || typeof request !== "object") {
            throw new TypeError("transpileEvent requires a request object");
        }
        const { sourceText, symbolId } = request;
        const sourcePath = request.sourcePath;
        const thisName = request.thisName ?? "self";
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
            const baseOracle = this.getSemanticAnalyzers();
            const locals = collectLocalVariables(ast);
            const oracle = new EventContextOracle(baseOracle, locals);
            const emitter = new GmlToJsEmitter(oracle, this.emitterOptions);
            const jsBody = emitter.emit(ast);

            const timestamp = Date.now();
            const patch: EventPatch = {
                kind: "event",
                id: symbolId,
                js_body: jsBody,
                this_name: thisName,
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

    transpileExpression(sourceText: string): string {
        if (typeof sourceText !== "string" || sourceText.length === 0) {
            throw new TypeError("transpileExpression requires a sourceText string");
        }

        try {
            const parser = new Parser.GMLParser(sourceText);
            const ast = parser.parse() as unknown as ProgramNode;
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
