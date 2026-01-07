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
import { Transpiler } from "@gml-modules/transpiler";
import { formatCliError } from "../../cli-core/errors.js";
import type { PatchBroadcaster } from "../websocket/server.js";

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
    const normalizedPath = path.normalize(filePath);
    const segments = Core.compactArray(normalizedPath.split(path.sep));

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== "objects") {
            continue;
        }

        const objectName = segments[index + 1];
        const eventFile = segments[index + 2];
        if (!objectName || !eventFile) {
            continue;
        }

        const eventName = path.basename(eventFile, path.extname(eventFile));
        if (!eventName) {
            continue;
        }

        return `gml_Object_${objectName}_${eventName}`;
    }

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== "scripts") {
            continue;
        }

        const scriptFile = segments[index + 1];
        if (!scriptFile) {
            continue;
        }

        const scriptName = path.basename(scriptFile, path.extname(scriptFile));
        if (!scriptName) {
            continue;
        }

        return `gml_Script_${scriptName}`;
    }

    return null;
}

/**
 * Classifies a transpilation error and extracts metadata for better error reporting.
 */
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

        let recoveryHint: string | undefined;
        if (syntaxError.message.includes("missing associated closing brace")) {
            recoveryHint = "Add a closing brace '}' to match the opening brace.";
        } else if (syntaxError.message.includes("unexpected end of file")) {
            recoveryHint = "Check for unclosed blocks, parentheses, or brackets.";
        } else if (syntaxError.message.includes("unexpected symbol")) {
            recoveryHint = "Review the syntax at the indicated position. Check for typos or missing operators.";
        } else if (syntaxError.message.includes("function parameters")) {
            recoveryHint = "Function parameters must be valid identifiers separated by commas.";
        }

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

    let errorString: string;
    if (Core.isErrorLike(error) && error.message) {
        errorString = error.message;
    } else if (error instanceof Error) {
        errorString = error.toString();
    } else {
        errorString = "Unknown error";
    }

    return {
        category: "unknown",
        message: errorString
    };
}

export interface TranspilationContext {
    transpiler: RuntimeTranspiler;
    patches: Array<RuntimeTranspilerPatch>;
    metrics: Array<TranspilationMetrics>;
    errors: Array<TranspilationError>;
    lastSuccessfulPatches: Map<string, RuntimeTranspilerPatch>;
    maxPatchHistory: number;
    websocketServer: PatchBroadcaster | null;
}

export interface TranspilationOptions {
    verbose: boolean;
    quiet: boolean;
}

export interface TranspilationResult {
    success: boolean;
    patch?: RuntimeTranspilerPatch;
    metrics?: TranspilationMetrics;
    error?: TranspilationError;
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

/**
 * Transpiles a GML file and manages the complete lifecycle including metrics
 * tracking, patch validation, and WebSocket broadcasting.
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
        const symbolId = `gml/script/${fileName}`;

        const patch = context.transpiler.transpileScript({
            sourceText: content,
            symbolId
        });
        const runtimeId = resolveRuntimeId(filePath);
        const patchPayload = runtimeId === null ? patch : { ...patch, runtimeId };

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

        context.lastSuccessfulPatches.set(symbolId, patchPayload);

        addToBoundedCollection(context.patches, patchPayload, context.maxPatchHistory);

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

        if (!quiet) {
            if (verbose) {
                console.log(
                    `  ↳ Transpiled to JavaScript (${patchPayload.js_body.length} chars in ${durationMs.toFixed(2)}ms)`
                );
                console.log(`  ↳ Patch ID: ${patchPayload.id}`);
            } else {
                console.log(`  ↳ Generated patch: ${patchPayload.id}`);
            }
        }

        return {
            success: true,
            patch: patchPayload,
            metrics
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
