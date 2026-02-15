/**
 * Transpilation coordinator for the CLI watch command.
 *
 * This module manages transpilation lifecycle, metrics tracking, and patch
 * orchestration for the hot-reload pipeline. It serves as the bridge between
 * file change detection and WebSocket patch streaming.
 */

import path from "node:path";

import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";
import type { Transpiler } from "@gml-modules/transpiler";

import { formatCliError } from "../../cli-core/index.js";
import type { PatchBroadcaster } from "../websocket/server.js";
import { getRuntimePathSegments, resolveObjectRuntimeIdFromSegments } from "./runtime-identifiers.js";
import { extractReferencesFromAst, extractSymbolsFromAst } from "./symbol-extraction.js";

type RuntimeTranspiler = InstanceType<typeof Transpiler.GmlTranspiler>;
export type RuntimeTranspilerPatch = ReturnType<RuntimeTranspiler["transpileScript"]>;

export interface TranspilationMetrics {
    timestamp: number;
    filePath: string;
    patchId: string;
    durationMs: number;
    sourceSize: number;
    outputSize: number;
    linesProcessed: number;
}

export type ErrorCategory = "syntax" | "validation" | "internal" | "unknown";

export interface TranspilationError {
    timestamp: number;
    filePath: string;
    error: string;
    sourceSize?: number;
    category: ErrorCategory;
    line?: number;
    column?: number;
    recoveryHint?: string;
}

function resolveRuntimeId(filePath: string): string | null {
    const segments = getRuntimePathSegments(filePath);
    const objectRuntimeId = resolveObjectRuntimeIdFromSegments(segments);
    if (objectRuntimeId) {
        return objectRuntimeId;
    }

    return null;
}

/**
 * Classifies a transpilation error and extracts metadata for better error reporting.
 */
function resolveSyntaxRecoveryHint(message: string): string | undefined {
    if (message.includes("missing associated closing brace")) {
        return "Add a closing brace '}' to match the opening brace.";
    }
    if (message.includes("unexpected end of file")) {
        return "Check for unclosed blocks, parentheses, or brackets.";
    }
    if (message.includes("unexpected symbol")) {
        return "Review the syntax at the indicated position. Check for typos or missing operators.";
    }
    if (message.includes("function parameters")) {
        return "Function parameters must be valid identifiers separated by commas.";
    }
    return undefined;
}

function classifyTranspilationError(error: unknown): {
    category: ErrorCategory;
    message: string;
    line?: number;
    column?: number;
    recoveryHint?: string;
} {
    let targetError: unknown = error;

    if (Core.isErrorLike(error) && error.cause) {
        targetError = error.cause;
    }

    if (Parser.GameMakerSyntaxError.isParseError(targetError)) {
        const syntaxError = targetError;
        const line = syntaxError.line;
        const column = syntaxError.column;
        const recoveryHint = resolveSyntaxRecoveryHint(syntaxError.message);

        return {
            category: "syntax",
            message: syntaxError.message,
            line,
            column,
            recoveryHint
        };
    }

    if (Core.isErrorLike(error)) {
        if (error.message.includes("Generated patch failed validation")) {
            return {
                category: "validation",
                message: error.message,
                recoveryHint:
                    "The transpiler produced invalid output. This may indicate an internal issue. Try simplifying the code."
            };
        }

        if (
            error.message.includes("requires a request object") ||
            error.message.includes("requires a sourceText string") ||
            error.message.includes("requires a symbolId string")
        ) {
            return {
                category: "validation",
                message: error.message,
                recoveryHint: "Ensure the file is a valid GML source file."
            };
        }

        if (error.message.includes("Failed to transpile script")) {
            const causeMatch = /Failed to transpile script [^:]+: (.+)$/u.exec(error.message);
            const innerMessage = causeMatch ? causeMatch[1] : error.message;
            return {
                category: "internal",
                message: innerMessage,
                recoveryHint:
                    "An internal transpilation error occurred. This may be a bug. Check for unsupported GML features."
            };
        }

        return {
            category: "unknown",
            message: error.message
        };
    }

    const errorString = error instanceof Error ? error.toString() : "Unknown error";

    return {
        category: "unknown",
        message: errorString
    };
}

/**
 * Lightweight patch summary for history tracking.
 *
 * Avoids retaining full JavaScript payloads in memory by storing only
 * the byte size. This allows memory usage tracking without keeping
 * the entire transpiled code in the history buffer.
 */
export interface PatchSummary {
    id: string;
    kind: string;
    runtimeId?: string;
    sourcePath?: string;
    timestamp?: number;
    jsBodyBytes: number;
}

/**
 * Transpiler execution service.
 *
 * Provides access to the transpiler instance without coupling to
 * metrics, error tracking, or broadcasting concerns.
 */
export interface TranspilerProvider {
    transpiler: RuntimeTranspiler;
}

/**
 * Patch history management.
 *
 * Provides patch summary storage and successful patch caching without
 * coupling to metrics, error tracking, or broadcasting operations.
 */
export interface PatchHistoryStore {
    /**
     * Lightweight summaries of recent patches, trimmed to avoid retaining full
     * JavaScript payloads in memory. `jsBodyBytes` records the payload size so
     * memory usage can be tracked without storing the full string.
     */
    patches: Array<PatchSummary>;
    lastSuccessfulPatches: Map<string, RuntimeTranspilerPatch>;
    maxPatchHistory: number;
    totalPatchCount: number;
}

/**
 * Metrics collection service.
 *
 * Provides transpilation metrics tracking without coupling to patch
 * history, error tracking, or broadcasting operations.
 */
export interface MetricsCollector {
    metrics: Array<TranspilationMetrics>;
    maxPatchHistory: number;
}

/**
 * Error collection service.
 *
 * Provides transpilation error tracking without coupling to metrics,
 * patch history, or broadcasting operations.
 */
export interface ErrorCollector {
    errors: Array<TranspilationError>;
    maxPatchHistory: number;
}

/**
 * Patch broadcasting service.
 *
 * Provides WebSocket patch distribution without coupling to metrics,
 * error tracking, or history management.
 */
export interface PatchBroadcastService {
    websocketServer: PatchBroadcaster | null;
}

/**
 * Script name registry.
 *
 * Provides script name tracking without coupling to transpilation,
 * metrics, or broadcasting operations.
 */
export interface ScriptRegistry {
    scriptNames?: Set<string>;
}

/**
 * Complete transpilation context interface.
 *
 * Combines all role-focused interfaces for consumers that need full
 * transpilation capabilities. Consumers should prefer depending on
 * the minimal interface they need (TranspilerProvider, MetricsCollector, etc.)
 * rather than this composite interface when possible.
 */
export interface TranspilationContext
    extends TranspilerProvider,
        PatchHistoryStore,
        MetricsCollector,
        ErrorCollector,
        PatchBroadcastService,
        ScriptRegistry {}

export interface TranspilationOptions {
    verbose: boolean;
    quiet: boolean;
}

export interface TranspilationResult {
    success: boolean;
    patch?: RuntimeTranspilerPatch;
    metrics?: TranspilationMetrics;
    error?: TranspilationError;
    symbols?: Array<string>;
    references?: Array<string>;
}

/**
 * Adds an item to a bounded collection, removing the oldest item if the
 * collection exceeds its maximum size.
 */
function addToBoundedCollection<T>(collection: Array<T>, item: T, maxSize: number): void {
    collection.push(item);
    if (collection.length > maxSize) {
        collection.shift();
    }
}

/**
 * Validates a transpiled patch before broadcasting.
 */
function validatePatch(patch: RuntimeTranspilerPatch): boolean {
    if (!patch || typeof patch !== "object") {
        return false;
    }

    if (!patch.id || typeof patch.id !== "string") {
        return false;
    }

    if (!patch.kind || typeof patch.kind !== "string") {
        return false;
    }

    if (!patch.js_body || typeof patch.js_body !== "string") {
        return false;
    }

    if (patch.js_body.trim().length === 0) {
        return false;
    }

    return true;
}

/**
 * Creates an error notification message for WebSocket clients.
 */
function createErrorNotification(
    filePath: string,
    error: string
): {
    kind: "error";
    filePath: string;
    error: string;
    timestamp: number;
} {
    return {
        kind: "error",
        filePath: path.basename(filePath),
        error,
        timestamp: Date.now()
    };
}

function createPatchSummary(patchPayload: RuntimeTranspilerPatch): PatchSummary {
    const metadata = Core.isObjectLike(patchPayload.metadata) ? patchPayload.metadata : null;
    const sourcePath = Core.isNonEmptyString(metadata?.sourcePath) ? metadata.sourcePath : undefined;
    const timestamp = Core.isFiniteNumber(metadata?.timestamp) ? metadata.timestamp : undefined;
    const runtimeIdValue = (patchPayload as { runtimeId?: unknown }).runtimeId;
    const runtimeId = Core.isNonEmptyString(runtimeIdValue) ? runtimeIdValue : undefined;

    return {
        id: patchPayload.id,
        kind: patchPayload.kind,
        runtimeId,
        sourcePath,
        timestamp,
        jsBodyBytes: Buffer.byteLength(patchPayload.js_body, "utf8")
    };
}

function hasRuntimePatchChanged(
    previousPatch: RuntimeTranspilerPatch | undefined,
    nextPatch: RuntimeTranspilerPatch
): boolean {
    if (!previousPatch) {
        return true;
    }

    const previousRuntimeId = (previousPatch as { runtimeId?: unknown }).runtimeId;
    const nextRuntimeId = (nextPatch as { runtimeId?: unknown }).runtimeId;

    return (
        previousPatch.id !== nextPatch.id ||
        previousPatch.kind !== nextPatch.kind ||
        previousRuntimeId !== nextRuntimeId ||
        previousPatch.js_body !== nextPatch.js_body
    );
}

/**
 * Transpiles a GML file and manages the complete lifecycle including metrics
 * tracking, patch validation, symbol extraction, and WebSocket broadcasting.
 */
export function transpileFile(
    context: TranspilationContext,
    filePath: string,
    content: string,
    lines: number,
    options: TranspilationOptions
): TranspilationResult {
    const { verbose, quiet } = options;
    const startTime = performance.now();

    try {
        const fileName = path.basename(filePath, path.extname(filePath));
        const defaultSymbolId = `gml/script/${fileName}`;

        let parsedSymbols: Array<string> = [];
        let parsedReferences: Array<string> = [];
        let parseError: unknown = null;
        let ast: unknown = undefined;

        try {
            const parser = new Parser.GMLParser(content, {});
            ast = parser.parse();
            parsedSymbols = extractSymbolsFromAst(ast, filePath);
            parsedReferences = extractReferencesFromAst(ast);
        } catch (error) {
            parseError = error;
            ast = undefined;
        }

        const scriptSymbolId = getPrimaryScriptPatchId(parsedSymbols);
        const symbolId = scriptSymbolId ?? defaultSymbolId;

        const patch = context.transpiler.transpileScript({
            sourceText: content,
            symbolId,
            ...(ast === undefined ? {} : { ast })
        });
        const runtimeId = resolveRuntimeId(filePath);
        const patchWithMetadata = {
            ...patch,
            metadata: {
                ...patch.metadata,
                sourcePath: filePath
            }
        };
        const patchPayload = runtimeId === null ? patchWithMetadata : { ...patchWithMetadata, runtimeId };

        if (!validatePatch(patchPayload)) {
            throw new Error("Generated patch failed validation");
        }

        const durationMs = performance.now() - startTime;

        const metrics: TranspilationMetrics = {
            timestamp: Date.now(),
            filePath,
            patchId: patchPayload.id,
            durationMs,
            sourceSize: content.length,
            outputSize: patchPayload.js_body.length,
            linesProcessed: lines
        };

        addToBoundedCollection(context.metrics, metrics, context.maxPatchHistory);

        const previousPatch = context.lastSuccessfulPatches.get(symbolId);
        const runtimePatchChanged = hasRuntimePatchChanged(previousPatch, patchPayload);

        context.lastSuccessfulPatches.set(symbolId, patchPayload);

        if (context.scriptNames) {
            registerScriptNamesFromSymbols(parsedSymbols, context.scriptNames);
        }

        if (runtimePatchChanged) {
            addToBoundedCollection(context.patches, createPatchSummary(patchPayload), context.maxPatchHistory);
            context.totalPatchCount += 1;

            const broadcastResult = context.websocketServer?.broadcast(patchPayload);
            if (broadcastResult && !quiet) {
                if (verbose) {
                    console.log(`  ↳ Broadcasted to ${broadcastResult.successCount} clients`);
                    if (broadcastResult.failureCount > 0) {
                        console.log(`  ↳ Failed to send to ${broadcastResult.failureCount} clients`);
                    }
                } else if (broadcastResult.successCount > 0) {
                    console.log(`  ↳ Streamed to ${broadcastResult.successCount} client(s)`);
                }
            }
        } else if (verbose && !quiet) {
            console.log("  ↳ Runtime patch unchanged; skipping patch broadcast");
        }

        if (!quiet) {
            if (verbose) {
                console.log(
                    `  ↳ Transpiled to JavaScript (${patchPayload.js_body.length} chars in ${durationMs.toFixed(2)}ms)`
                );
                console.log(`  ↳ Patch ID: ${patchPayload.id}`);
                if (patchPayload.metadata?.timestamp) {
                    console.log(`  ↳ Generated at: ${new Date(patchPayload.metadata.timestamp).toISOString()}`);
                }
                if (parsedSymbols.length > 0) {
                    console.log(`  ↳ Extracted symbols: ${parsedSymbols.join(", ")}`);
                }
                if (parsedReferences.length > 0) {
                    console.log(`  ↳ Extracted references: ${parsedReferences.join(", ")}`);
                }
                if (parseError) {
                    const message = Core.getErrorMessage(parseError, {
                        fallback: "Unknown parse error"
                    });
                    console.log(`  ↳ Warning: Could not extract symbols/references from AST: ${message}`);
                }
            } else if (runtimePatchChanged) {
                console.log(`  ↳ Generated patch: ${patchPayload.id}`);
            }
        }

        return {
            success: true,
            patch: patchPayload,
            metrics,
            symbols: parsedSymbols,
            references: parsedReferences
        };
    } catch (error) {
        const classified = classifyTranspilationError(error);

        const transpilationError: TranspilationError = {
            timestamp: Date.now(),
            filePath,
            error: classified.message,
            sourceSize: content.length,
            category: classified.category,
            line: classified.line,
            column: classified.column,
            recoveryHint: classified.recoveryHint
        };

        addToBoundedCollection(context.errors, transpilationError, context.maxPatchHistory);

        if (context.websocketServer) {
            const errorNotification = createErrorNotification(filePath, classified.message);
            context.websocketServer.broadcast(errorNotification);
        }

        if (verbose) {
            const formattedError = formatCliError(error);
            console.error(`  ↳ Transpilation failed (${classified.category}):\n${formattedError}`);
            if (classified.line !== undefined && classified.column !== undefined) {
                console.error(`  ↳ Location: line ${classified.line}, column ${classified.column}`);
            }
            if (classified.recoveryHint) {
                console.error(`  ↳ Hint: ${classified.recoveryHint}`);
            }
        } else {
            const locationInfo =
                classified.line !== undefined && classified.column !== undefined
                    ? ` (line ${classified.line}, column ${classified.column})`
                    : "";
            console.error(`  ↳ Transpilation failed: ${classified.message}${locationInfo}`);
            if (classified.recoveryHint && !quiet) {
                console.error(`  ↳ Hint: ${classified.recoveryHint}`);
            }
        }

        return {
            success: false,
            error: transpilationError
        };
    }
}

/**
 * Displays transpilation and error statistics.
 */
export function displayTranspilationStatistics(
    context: {
        metrics: ReadonlyArray<TranspilationMetrics>;
        errors: ReadonlyArray<TranspilationError>;
    },
    verbose: boolean,
    quiet: boolean
): void {
    if (quiet) {
        return;
    }

    const { metrics, errors } = context;
    const hasMetrics = metrics.length > 0;
    const hasErrors = errors.length > 0;

    if (!hasMetrics && !hasErrors) {
        return;
    }

    console.log("\n--- Transpilation Statistics ---");

    if (hasMetrics) {
        console.log(`Total patches generated: ${metrics.length}`);

        if (verbose) {
            const totalDuration = metrics.reduce((sum, m) => sum + m.durationMs, 0);
            const totalSourceSize = metrics.reduce((sum, m) => sum + m.sourceSize, 0);
            const totalOutputSize = metrics.reduce((sum, m) => sum + m.outputSize, 0);
            const avgDuration = totalDuration / metrics.length;

            console.log(`Total transpilation time: ${totalDuration.toFixed(2)}ms`);
            console.log(`Average transpilation time: ${avgDuration.toFixed(2)}ms`);
            console.log(`Total source processed: ${(totalSourceSize / 1024).toFixed(2)} KB`);
            console.log(`Total output generated: ${(totalOutputSize / 1024).toFixed(2)} KB`);

            const compressionRatio =
                totalSourceSize > 0 ? `${((totalOutputSize / totalSourceSize) * 100).toFixed(1)}%` : "N/A";
            console.log(`Output/source ratio: ${compressionRatio}`);

            if (metrics.length > 0) {
                const fastestPatch = metrics.reduce((min, m) => (m.durationMs < min.durationMs ? m : min));
                const slowestPatch = metrics.reduce((max, m) => (m.durationMs > max.durationMs ? m : max));

                console.log(
                    `Fastest transpilation: ${fastestPatch.durationMs.toFixed(2)}ms (${path.basename(fastestPatch.filePath)})`
                );
                console.log(
                    `Slowest transpilation: ${slowestPatch.durationMs.toFixed(2)}ms (${path.basename(slowestPatch.filePath)})`
                );
            }
        }
    }

    if (hasErrors) {
        console.log(`\nTotal errors: ${errors.length}`);

        if (verbose) {
            const errorsByCategory = new Map<ErrorCategory, number>();
            for (const error of errors) {
                const count = errorsByCategory.get(error.category) ?? 0;
                errorsByCategory.set(error.category, count + 1);
            }

            console.log("\nErrors by category:");
            for (const [category, count] of errorsByCategory.entries()) {
                console.log(`  ${category}: ${count}`);
            }
        }

        if (verbose && errors.length > 0) {
            console.log("\nRecent errors:");
            const recentErrors = errors.slice(-5);
            for (const error of recentErrors) {
                const timestamp = new Date(error.timestamp).toISOString();
                const locationInfo =
                    error.line !== undefined && error.column !== undefined
                        ? ` (line ${error.line}, col ${error.column})`
                        : "";
                console.log(`  [${timestamp}] ${path.basename(error.filePath)}${locationInfo}`);
                console.log(`    Category: ${error.category}`);
                console.log(`    ${error.error}`);
                if (error.recoveryHint) {
                    console.log(`    Hint: ${error.recoveryHint}`);
                }
            }
        }
    }

    console.log("-------------------------------\n");
}

export function registerScriptNamesFromSymbols(symbols: ReadonlyArray<string>, scriptNames: Set<string>): void {
    for (const symbol of symbols) {
        const scriptName = symbolIdToScriptName(symbol);
        if (scriptName) {
            scriptNames.add(scriptName);
        }
    }
}

function symbolIdToScriptName(symbolId: string): string | null {
    if (symbolId.startsWith("gml_Script_")) {
        return symbolId.slice("gml_Script_".length);
    }
    if (symbolId.startsWith("gml_GlobalScript_")) {
        return symbolId.slice("gml_GlobalScript_".length);
    }
    return null;
}

function runtimeSymbolToPatchId(symbolId: string): string | null {
    const scriptName = symbolIdToScriptName(symbolId);
    if (scriptName) {
        return `gml/script/${scriptName}`;
    }
    return null;
}

function getPrimaryScriptPatchId(symbols: ReadonlyArray<string>): string | null {
    for (const symbol of symbols) {
        const patchId = runtimeSymbolToPatchId(symbol);
        if (patchId) {
            return patchId;
        }
    }
    return null;
}
