/**
 * Transpilation coordinator for the CLI watch command.
 *
 * This module manages transpilation lifecycle, metrics tracking, and patch
 * orchestration for the hot-reload pipeline. It serves as the bridge between
 * file change detection and WebSocket patch streaming.
 */

import path from "node:path";

import { Core } from "@gml-modules/core";
import { Transpiler } from "@gml-modules/transpiler";
import { formatCliError } from "../../cli-core/errors.js";
import type { PatchWebSocketServerController } from "../websocket/server.js";

const { getErrorMessage } = Core;

type RuntimeTranspiler = ReturnType<typeof Transpiler.createTranspiler>;
type RuntimeTranspilerPatch = ReturnType<RuntimeTranspiler["transpileScript"]>;

export interface TranspilationMetrics {
    timestamp: number;
    filePath: string;
    patchId: string;
    durationMs: number;
    sourceSize: number;
    outputSize: number;
    linesProcessed: number;
}

export interface TranspilationError {
    timestamp: number;
    filePath: string;
    error: string;
    sourceSize?: number;
}

export interface TranspilationContext {
    transpiler: RuntimeTranspiler;
    patches: Array<RuntimeTranspilerPatch>;
    metrics: Array<TranspilationMetrics>;
    errors: Array<TranspilationError>;
    lastSuccessfulPatches: Map<string, RuntimeTranspilerPatch>;
    maxPatchHistory: number;
    websocketServer: PatchWebSocketServerController | null;
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
function addToBoundedCollection<T>(
    collection: Array<T>,
    item: T,
    maxSize: number
): void {
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

        if (!validatePatch(patch)) {
            throw new Error("Generated patch failed validation");
        }

        const durationMs = performance.now() - startTime;

        const metrics: TranspilationMetrics = {
            timestamp: Date.now(),
            filePath,
            patchId: patch.id,
            durationMs,
            sourceSize: content.length,
            outputSize: patch.js_body.length,
            linesProcessed: lines
        };

        addToBoundedCollection(
            context.metrics,
            metrics,
            context.maxPatchHistory
        );

        context.lastSuccessfulPatches.set(symbolId, patch);

        addToBoundedCollection(context.patches, patch, context.maxPatchHistory);

        const broadcastResult = context.websocketServer?.broadcast(patch);
        if (broadcastResult && !quiet) {
            if (verbose) {
                console.log(
                    `  ↳ Broadcasted to ${broadcastResult.successCount} clients`
                );
                if (broadcastResult.failureCount > 0) {
                    console.log(
                        `  ↳ Failed to send to ${broadcastResult.failureCount} clients`
                    );
                }
            } else if (broadcastResult.successCount > 0) {
                console.log(
                    `  ↳ Streamed to ${broadcastResult.successCount} client(s)`
                );
            }
        }

        if (!quiet) {
            if (verbose) {
                console.log(
                    `  ↳ Transpiled to JavaScript (${patch.js_body.length} chars in ${durationMs.toFixed(2)}ms)`
                );
                console.log(`  ↳ Patch ID: ${patch.id}`);
            } else {
                console.log(`  ↳ Generated patch: ${patch.id}`);
            }
        }

        return {
            success: true,
            patch,
            metrics
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error, {
            fallback: "Unknown transpilation error"
        });

        const transpilationError: TranspilationError = {
            timestamp: Date.now(),
            filePath,
            error: errorMessage,
            sourceSize: content.length
        };

        addToBoundedCollection(
            context.errors,
            transpilationError,
            context.maxPatchHistory
        );

        if (context.websocketServer) {
            const errorNotification = createErrorNotification(
                filePath,
                errorMessage
            );
            context.websocketServer.broadcast(errorNotification);
        }

        if (verbose) {
            const formattedError = formatCliError(error);
            console.error(`  ↳ Transpilation failed:\n${formattedError}`);
        } else {
            console.error(`  ↳ Transpilation failed: ${errorMessage}`);
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
            const totalDuration = metrics.reduce(
                (sum, m) => sum + m.durationMs,
                0
            );
            const totalSourceSize = metrics.reduce(
                (sum, m) => sum + m.sourceSize,
                0
            );
            const totalOutputSize = metrics.reduce(
                (sum, m) => sum + m.outputSize,
                0
            );
            const avgDuration = totalDuration / metrics.length;

            console.log(
                `Total transpilation time: ${totalDuration.toFixed(2)}ms`
            );
            console.log(
                `Average transpilation time: ${avgDuration.toFixed(2)}ms`
            );
            console.log(
                `Total source processed: ${(totalSourceSize / 1024).toFixed(2)} KB`
            );
            console.log(
                `Total output generated: ${(totalOutputSize / 1024).toFixed(2)} KB`
            );

            const compressionRatio =
                totalSourceSize > 0
                    ? `${((totalOutputSize / totalSourceSize) * 100).toFixed(1)}%`
                    : "N/A";
            console.log(`Output/source ratio: ${compressionRatio}`);

            const fastestPatch = metrics.reduce((min, m) =>
                m.durationMs < min.durationMs ? m : min
            );
            const slowestPatch = metrics.reduce((max, m) =>
                m.durationMs > max.durationMs ? m : max
            );

            console.log(
                `Fastest transpilation: ${fastestPatch.durationMs.toFixed(2)}ms (${path.basename(fastestPatch.filePath)})`
            );
            console.log(
                `Slowest transpilation: ${slowestPatch.durationMs.toFixed(2)}ms (${path.basename(slowestPatch.filePath)})`
            );
        }
    }

    if (hasErrors) {
        console.log(`\nTotal errors: ${errors.length}`);
        if (verbose && errors.length > 0) {
            console.log("\nRecent errors:");
            const recentErrors = errors.slice(-5);
            for (const error of recentErrors) {
                const timestamp = new Date(error.timestamp).toISOString();
                console.log(
                    `  [${timestamp}] ${path.basename(error.filePath)}`
                );
                console.log(`    ${error.error}`);
            }
        }
    }

    console.log("-------------------------------\n");
}
