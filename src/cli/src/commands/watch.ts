/**
 * Watch command for monitoring GML source files and coordinating hot-reload pipeline.
 *
 * This command provides the foundation for the live development workflow described in
 * docs/live-reloading-concept.md. It watches specified directories for .gml file changes
 * and triggers appropriate actions (parsing, semantic analysis, transpilation, and patch
 * streaming) as the hot-reload pipeline matures.
 *
 * Current implementation focuses on file system watching and change detection.
 * Future iterations will integrate with the transpiler, semantic analyzer, and runtime
 * wrapper to enable true hot-reloading without game restarts.
 */

import {
    watch,
    type FSWatcher,
    type WatchListener,
    type WatchOptions
} from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Command, Option } from "commander";

import { Core } from "@gml-modules/core";
import { Transpiler } from "@gml-modules/transpiler";
import {
    describeRuntimeSource,
    resolveRuntimeSource,
    DEFAULT_RUNTIME_PACKAGE,
    type RuntimeSourceDescriptor,
    type RuntimeSourceResolver
} from "../modules/runtime/source.js";
import {
    startRuntimeStaticServer,
    type RuntimeServerController
} from "../modules/runtime/server.js";
import {
    startPatchWebSocketServer,
    type PatchBroadcastResult,
    type PatchWebSocketServerController
} from "../modules/websocket/server.js";
import { formatCliError } from "../cli-core/errors.js";
import { debounce, type DebouncedFunction } from "../shared/debounce.js";

const { getErrorMessage } = Core;

type RuntimeTranspiler = ReturnType<typeof Transpiler.createTranspiler>;
type RuntimeTranspilerPatch = ReturnType<RuntimeTranspiler["transpileScript"]>;

type RuntimeDescriptorFormatter = (source: RuntimeSourceDescriptor) => string;

type WatchFactory = (
    path: string,
    options?: WatchOptions | BufferEncoding | "buffer",
    listener?: WatchListener<string>
) => FSWatcher;

interface TranspilationMetrics {
    timestamp: number;
    filePath: string;
    patchId: string;
    durationMs: number;
    sourceSize: number;
    outputSize: number;
    linesProcessed: number;
}

interface TranspilationError {
    timestamp: number;
    filePath: string;
    error: string;
    sourceSize?: number;
}

interface WatchCommandOptions {
    extensions?: Array<string>;
    polling?: boolean;
    pollingInterval?: number;
    verbose?: boolean;
    debounceDelay?: number;
    websocketPort?: number;
    websocketHost?: string;
    websocketServer?: boolean;
    runtimeRoot?: string;
    runtimePackage?: string;
    runtimeServer?: boolean;
    hydrateRuntime?: boolean;
    maxPatchHistory?: number;
    runtimeResolver?: RuntimeSourceResolver;
    runtimeDescriptor?: RuntimeDescriptorFormatter;
    runtimeServerStarter?: typeof startRuntimeStaticServer;
    abortSignal?: AbortSignal;
    watchFactory?: WatchFactory;
}

interface RuntimeContext {
    root: string | null;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
    server: RuntimeServerController | null;
    noticeLogged: boolean;
    transpiler: RuntimeTranspiler;
    patches: Array<RuntimeTranspilerPatch>;
    metrics: Array<TranspilationMetrics>;
    errors: Array<TranspilationError>;
    lastSuccessfulPatches: Map<string, RuntimeTranspilerPatch>;
    maxPatchHistory: number;
    websocketServer: PatchWebSocketServerController | null;
    debouncedHandlers: Map<
        string,
        DebouncedFunction<[string, string, FileChangeOptions]>
    >;
}

interface FileChangeOptions {
    verbose?: boolean;
    runtimeContext?: RuntimeContext;
}

/**
 * Creates the watch command for monitoring GML source files.
 *
 * @returns {Command} Commander command instance
 */
export function createWatchCommand(): Command {
    const command = new Command("watch");

    command
        .description(
            "Watch GML source files and coordinate hot-reload pipeline actions"
        )
        .argument(
            "[targetPath]",
            "Directory to watch for changes",
            process.cwd()
        )
        .addOption(
            new Option(
                "--extensions <extensions...>",
                "File extensions to watch"
            ).default([".gml"], "Only .gml files")
        )
        .addOption(
            new Option(
                "--polling",
                "Use polling instead of native file watching"
            ).default(false)
        )
        .addOption(
            new Option(
                "--polling-interval <ms>",
                "Polling interval in milliseconds"
            )
                .argParser((value) => {
                    const parsed = Number.parseInt(value);
                    if (Number.isNaN(parsed) || parsed < 100) {
                        throw new Error(
                            "Polling interval must be at least 100ms"
                        );
                    }
                    return parsed;
                })
                .default(1000)
        )
        .addOption(
            new Option("--verbose", "Enable verbose logging").default(false)
        )
        .addOption(
            new Option(
                "--debounce-delay <ms>",
                "Delay in milliseconds before transpiling after file changes (0 to disable)"
            )
                .argParser((value) => {
                    const parsed = Number.parseInt(value);
                    if (Number.isNaN(parsed) || parsed < 0) {
                        throw new Error("Debounce delay must be non-negative");
                    }
                    return parsed;
                })
                .default(200)
        )
        .addOption(
            new Option(
                "--max-patch-history <count>",
                "Maximum number of patches to retain in memory"
            )
                .argParser((value) => {
                    const parsed = Number.parseInt(value);
                    if (Number.isNaN(parsed) || parsed < 1) {
                        throw new Error(
                            "Max patch history must be a positive integer"
                        );
                    }
                    return parsed;
                })
                .default(100)
        )
        .addOption(
            new Option(
                "--websocket-port <port>",
                "WebSocket server port for streaming patches"
            )
                .argParser((value) => {
                    const parsed = Number.parseInt(value);
                    if (Number.isNaN(parsed) || parsed < 1 || parsed > 65_535) {
                        throw new Error("Port must be between 1 and 65535");
                    }
                    return parsed;
                })
                .default(17_890)
        )
        .addOption(
            new Option(
                "--websocket-host <host>",
                "WebSocket server host for streaming patches"
            ).default("127.0.0.1")
        )
        .option(
            "--no-websocket-server",
            "Disable starting the WebSocket server for patch streaming."
        )
        .addOption(
            new Option(
                "--runtime-root <path>",
                "Path to the HTML5 runtime assets (defaults to the vendor/GameMaker-HTML5 submodule when present, otherwise the installed runtime package)."
            )
        )
        .addOption(
            new Option(
                "--runtime-package <name>",
                "Package name used to resolve the HTML5 runtime."
            ).default(DEFAULT_RUNTIME_PACKAGE)
        )
        .option(
            "--no-runtime-server",
            "Disable starting the HTML5 runtime static server."
        )
        .action(runWatchCommand);

    return command;
}

/**
 * Validates and resolves the target directory path.
 *
 * @param {string} targetPath - Directory to validate
 * @returns {Promise<string>} Resolved absolute path
 */
async function validateTargetPath(targetPath: string): Promise<string> {
    const normalizedPath = path.resolve(targetPath);

    try {
        const stats = await stat(normalizedPath);
        if (!stats.isDirectory()) {
            console.error(`${normalizedPath} is not a directory`);
            process.exit(1);
        }
    } catch (error) {
        const message = getErrorMessage(error, {
            fallback: "Cannot access path"
        });
        const formattedError = formatCliError(
            new Error(`Cannot access ${normalizedPath}: ${message}`)
        );
        console.error(formattedError);
        process.exit(1);
    }

    return normalizedPath;
}

/**
 * Logs watch startup information.
 *
 * @param {string} targetPath - Directory being watched
 * @param {Set<string>} extensions - File extensions being watched
 * @param {boolean} polling - Whether polling mode is enabled
 * @param {number} pollingInterval - Polling interval in ms
 * @param {boolean} verbose - Whether verbose logging is enabled
 */
function logWatchStartup(
    targetPath: string,
    extensions: ReadonlySet<string>,
    polling: boolean,
    pollingInterval: number,
    verbose: boolean
) {
    if (verbose) {
        console.log(`Watching: ${targetPath}`);
        console.log(`Extensions: ${[...extensions].join(", ")}`);
        console.log(`Mode: ${polling ? "polling" : "native"}`);
        if (polling) {
            console.log(`Polling interval: ${pollingInterval}ms`);
        }
        console.log("\nWaiting for file changes... (Press Ctrl+C to stop)\n");
    } else {
        console.log(`Watching ${targetPath} for changes...`);
    }
}

const DEFAULT_WATCH_FACTORY: WatchFactory = (pathToWatch, options, listener) =>
    watch(pathToWatch, options, listener);

/**
 * Validates a transpiled patch before broadcasting.
 *
 * @param {object} patch - Patch object to validate
 * @returns {boolean} True if patch is valid
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

    // Patch should have non-empty JavaScript body
    if (patch.js_body.trim().length === 0) {
        return false;
    }

    return true;
}

/**
 * Creates an error notification message for WebSocket clients.
 *
 * @param {string} filePath - Path to the file that failed
 * @param {string} error - Error message
 * @returns {object} Error notification object
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
 * Displays transpilation and error statistics when watch stops.
 *
 * @param {object} context - Runtime context with metrics and errors
 * @param {boolean} verbose - Enable verbose statistics
 */
function displayWatchStatistics(
    context: {
        metrics: ReadonlyArray<TranspilationMetrics>;
        errors: ReadonlyArray<TranspilationError>;
    },
    verbose: boolean
): void {
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
            // Show last 5 errors
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

/**
 * Executes the watch command.
 *
 * @param {string} targetPath - Directory to watch
 * @param {object} options - Command options
 * @param {string[]} options.extensions - File extensions to watch
 * @param {boolean} options.polling - Use polling instead of native watching
 * @param {number} options.pollingInterval - Polling interval in milliseconds
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {number} options.websocketPort - WebSocket server port
 * @param {string} options.websocketHost - WebSocket server host
 * @param {boolean} options.websocketServer - Enable WebSocket server
 */
export async function runWatchCommand(
    targetPath: string,
    options: WatchCommandOptions = {}
): Promise<void> {
    const {
        extensions = [".gml"],
        polling = false,
        pollingInterval = 1000,
        verbose = false,
        debounceDelay = 200,
        maxPatchHistory = 100,
        websocketPort = 17_890,
        websocketHost = "127.0.0.1",
        websocketServer: enableWebSocket = true,
        abortSignal,
        runtimeRoot,
        runtimePackage = DEFAULT_RUNTIME_PACKAGE,
        runtimeServer,
        hydrateRuntime,
        runtimeResolver = resolveRuntimeSource,
        runtimeDescriptor = describeRuntimeSource,
        runtimeServerStarter = startRuntimeStaticServer,
        watchFactory = DEFAULT_WATCH_FACTORY
    } = options;

    const normalizedPath = await validateTargetPath(targetPath);

    const extensionSet = new Set(
        extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`))
    );

    const shouldServeRuntime =
        hydrateRuntime === undefined
            ? runtimeServer !== false
            : Boolean(hydrateRuntime);

    const transpiler = Transpiler.createTranspiler();
    const runtimeContext: RuntimeContext = {
        root: null,
        packageName: null,
        packageJson: null,
        server: null,
        noticeLogged: Boolean(verbose),
        transpiler,
        patches: [],
        metrics: [],
        errors: [],
        lastSuccessfulPatches: new Map(),
        maxPatchHistory,
        websocketServer: null,
        debouncedHandlers: new Map()
    };

    let runtimeServerController: RuntimeServerController | null = null;
    let websocketServerController: PatchWebSocketServerController | null = null;

    if (shouldServeRuntime) {
        const runtimeSource = await runtimeResolver({
            runtimeRoot,
            runtimePackage
        });

        runtimeContext.root = runtimeSource.root;
        runtimeContext.packageName = runtimeSource.packageName;
        runtimeContext.packageJson = runtimeSource.packageJson;

        if (verbose) {
            console.log(
                `Using HTML5 runtime from ${runtimeDescriptor(runtimeSource)}`
            );
        }

        runtimeServerController = await runtimeServerStarter({
            runtimeRoot: runtimeSource.root,
            verbose
        });

        runtimeContext.server = runtimeServerController;

        console.log(
            `Runtime static server ready at ${runtimeServerController.url}`
        );
    } else if (verbose) {
        console.log("Runtime static server disabled.");
    }

    if (enableWebSocket) {
        try {
            websocketServerController = await startPatchWebSocketServer({
                host: websocketHost,
                port: websocketPort,
                verbose,
                onClientConnect: (clientId, _socket) => {
                    void _socket;
                    if (verbose) {
                        console.log(
                            `Patch streaming client connected: ${clientId}`
                        );
                    }
                },
                prepareInitialMessages: () =>
                    Array.from(runtimeContext.lastSuccessfulPatches.values()),
                onClientDisconnect: (clientId) => {
                    if (verbose) {
                        console.log(
                            `Patch streaming client disconnected: ${clientId}`
                        );
                    }
                }
            });

            runtimeContext.websocketServer = websocketServerController;

            console.log(
                `WebSocket patch server ready at ${websocketServerController.url}`
            );
        } catch (error) {
            const message = getErrorMessage(error, {
                fallback: "Unknown WebSocket server error"
            });
            const formattedError = formatCliError(
                new Error(`Failed to start WebSocket server: ${message}`)
            );
            console.error(formattedError);
            process.exit(1);
        }
    } else if (verbose) {
        console.log("WebSocket patch server disabled.");
    }

    logWatchStartup(
        normalizedPath,
        extensionSet,
        polling,
        pollingInterval,
        verbose
    );

    const watchOptions: WatchOptions = {
        recursive: true,
        ...(polling && { persistent: true })
    };
    let watcher: FSWatcher | null = null;
    let resolved = false;

    const watchImplementation = watchFactory ?? watch;

    return new Promise((resolve) => {
        let removeAbortListener = () => {};

        const cleanup = async (exitCode = 0) => {
            if (resolved) {
                return;
            }
            resolved = true;

            if (verbose) {
                console.log("\nStopping watcher...");
            }

            if (watcher) {
                watcher.close();
            }

            process.off("SIGINT", handleErrorSignal);
            process.off("SIGTERM", handleErrorSignal);
            removeAbortListener();

            for (const debouncedHandler of runtimeContext.debouncedHandlers.values()) {
                debouncedHandler.flush();
            }
            runtimeContext.debouncedHandlers.clear();

            displayWatchStatistics(runtimeContext, verbose);

            if (runtimeServerController) {
                try {
                    await runtimeServerController.stop();
                } catch (error) {
                    const message = getErrorMessage(error, {
                        fallback: "Unknown server stop error"
                    });
                    console.error(
                        `Failed to stop runtime static server: ${message}`
                    );
                }
            }

            if (websocketServerController) {
                try {
                    await websocketServerController.stop();
                } catch (error) {
                    const message = getErrorMessage(error, {
                        fallback: "Unknown server stop error"
                    });
                    console.error(
                        `Failed to stop WebSocket server: ${message}`
                    );
                }
            }

            if (abortSignal) {
                resolve();
                return;
            }

            resolve();
            process.exit(exitCode);
        };

        const handleWatcherError = (error: unknown) => {
            const message = getErrorMessage(error, {
                fallback: "Unknown watch error"
            });
            const formattedError = formatCliError(
                new Error(`Watch error: ${message}`)
            );
            console.error(formattedError);
            void cleanup(1);
        };

        const handleErrorSignal = () => {
            cleanup(0).catch((error) => {
                const message = getErrorMessage(error, {
                    fallback: "Unknown cleanup error"
                });
                console.error(`Error during watch cleanup: ${message}`);
                process.exit(1);
            });
        };

        process.on("SIGINT", handleErrorSignal);
        process.on("SIGTERM", handleErrorSignal);

        if (abortSignal) {
            if (abortSignal.aborted) {
                void cleanup(0);
                return;
            }

            const abortHandler = () => {
                cleanup(0).catch((error) => {
                    const message = getErrorMessage(error, {
                        fallback: "Unknown cleanup error"
                    });
                    console.error(`Error during watch cleanup: ${message}`);
                });
            };

            abortSignal.addEventListener("abort", abortHandler, {
                once: true
            });

            removeAbortListener = () => {
                abortSignal.removeEventListener("abort", abortHandler);
            };
        }

        try {
            watcher = watchImplementation(
                normalizedPath,
                {
                    ...watchOptions,
                    ...(abortSignal && { signal: abortSignal })
                },
                (eventType, filename) => {
                    if (
                        !filename ||
                        !extensionSet.has(path.extname(filename))
                    ) {
                        return;
                    }

                    const fullPath = path.join(normalizedPath, filename);

                    if (verbose) {
                        console.log(
                            `[${new Date().toISOString()}] ${eventType}: ${filename}`
                        );
                    } else {
                        console.log(`Changed: ${filename}`);
                    }

                    if (debounceDelay === 0) {
                        handleFileChange(fullPath, eventType, {
                            verbose,
                            runtimeContext
                        }).catch((error) => {
                            const message = getErrorMessage(error, {
                                fallback: "Unknown file processing error"
                            });
                            console.error(
                                `Error processing ${filename}: ${message}`
                            );
                        });
                    } else {
                        let debouncedHandler =
                            runtimeContext.debouncedHandlers.get(fullPath);

                        if (!debouncedHandler) {
                            debouncedHandler = debounce(
                                (
                                    filePath: string,
                                    evt: string,
                                    opts: FileChangeOptions
                                ) => {
                                    handleFileChange(filePath, evt, opts).catch(
                                        (error) => {
                                            const message = getErrorMessage(
                                                error,
                                                {
                                                    fallback:
                                                        "Unknown file processing error"
                                                }
                                            );
                                            console.error(
                                                `Error processing ${filename}: ${message}`
                                            );
                                        }
                                    );
                                },
                                debounceDelay
                            );
                            runtimeContext.debouncedHandlers.set(
                                fullPath,
                                debouncedHandler
                            );
                        }

                        debouncedHandler(fullPath, eventType, {
                            verbose,
                            runtimeContext
                        });
                    }
                }
            );

            watcher.on("error", handleWatcherError);
        } catch (error) {
            handleWatcherError(error);
        }
    });
}

/**
 * Handles individual file change events.
 *
 * Coordinates with the transpiler to generate JavaScript patches when GML files change.
 * Future iterations will add semantic analysis and streaming to the runtime wrapper.
 *
 * @param {string} filePath - Full path to the changed file
 * @param {string} eventType - Type of file system event ('change' or 'rename')
 * @param {object} options - Processing options
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {object} options.runtimeContext - Runtime context with transpiler and patch storage
 */
async function handleFileChange(
    filePath: string,
    eventType: string,
    { verbose = false, runtimeContext }: FileChangeOptions = {}
): Promise<void> {
    if (verbose && runtimeContext?.root && !runtimeContext.noticeLogged) {
        console.log(`Runtime target: ${runtimeContext.root}`);
        runtimeContext.noticeLogged = true;
    }

    // File was created, deleted, or renamed. On some platforms (notably macOS)
    // a write can surface as a 'rename' event. If the file exists after the
    // rename, treat it as a change and continue to transpile. If the file was
    // removed, bail out early.
    let shouldTranspile = false;

    if (eventType === "rename") {
        try {
            await stat(filePath);
            shouldTranspile = true;
            if (verbose) {
                console.log(`  ↳ File exists (created or renamed)`);
            }
        } catch {
            if (verbose) {
                console.log(`  ↳ File removed (deleted or renamed away)`);
            }
            return;
        }
    }

    // For 'change' events, read the file and transpile it. Also transpile when
    // a 'rename' event left the file in place (see comment above).
    if (eventType === "change" || shouldTranspile) {
        try {
            const content = await readFile(filePath, "utf8");
            const lines = content.split("\n").length;

            if (verbose) {
                console.log(`  ↳ Read ${lines} lines`);
            }

            // Transpile the GML source to JavaScript
            const transpiler = runtimeContext?.transpiler;
            if (!transpiler) {
                return;
            }

            runTranspilationForFile(
                runtimeContext,
                transpiler,
                filePath,
                content,
                lines,
                verbose
            );
        } catch (error) {
            if (verbose) {
                const message = getErrorMessage(error, {
                    fallback: "Unknown file read error"
                });
                console.log(`  ↳ Error reading file: ${message}`);
            }
        }
    }
}

function runTranspilationForFile(
    runtimeContext: RuntimeContext,
    transpiler: RuntimeTranspiler,
    filePath: string,
    content: string,
    lines: number,
    verbose: boolean
): void {
    const startTime = performance.now();

    try {
        const fileName = path.basename(filePath, path.extname(filePath));
        const symbolId = `gml/script/${fileName}`;

        const patch = transpiler.transpileScript({
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

        runtimeContext.metrics.push(metrics);
        if (runtimeContext.metrics.length > runtimeContext.maxPatchHistory) {
            runtimeContext.metrics.shift();
        }

        runtimeContext.lastSuccessfulPatches.set(symbolId, patch);

        runtimeContext.patches.push(patch);
        if (runtimeContext.patches.length > runtimeContext.maxPatchHistory) {
            runtimeContext.patches.shift();
        }

        const broadcastResult =
            runtimeContext.websocketServer?.broadcast(patch);
        if (broadcastResult) {
            logPatchBroadcastResult(broadcastResult, verbose);
        }

        logTranspilationSummary(patch, durationMs, verbose);
    } catch (error) {
        handleTranspilationError(
            error,
            runtimeContext,
            filePath,
            content.length,
            verbose
        );
    }
}

function logPatchBroadcastResult(
    broadcastResult: PatchBroadcastResult,
    verbose: boolean
): void {
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

function logTranspilationSummary(
    patch: RuntimeTranspilerPatch,
    durationMs: number,
    verbose: boolean
): void {
    if (verbose) {
        console.log(
            `  ↳ Transpiled to JavaScript (${patch.js_body.length} chars in ${durationMs.toFixed(2)}ms)`
        );
        console.log(`  ↳ Patch ID: ${patch.id}`);
    } else {
        console.log(`  ↳ Generated patch: ${patch.id}`);
    }
}

function handleTranspilationError(
    error: unknown,
    runtimeContext: RuntimeContext,
    filePath: string,
    sourceSize: number,
    verbose: boolean
): void {
    const errorMessage = getErrorMessage(error, {
        fallback: "Unknown transpilation error"
    });
    const transpilationError: TranspilationError = {
        timestamp: Date.now(),
        filePath,
        error: errorMessage,
        sourceSize
    };

    runtimeContext.errors.push(transpilationError);
    if (runtimeContext.errors.length > runtimeContext.maxPatchHistory) {
        runtimeContext.errors.shift();
    }

    if (runtimeContext.websocketServer) {
        const errorNotification = createErrorNotification(
            filePath,
            errorMessage
        );
        runtimeContext.websocketServer.broadcast(errorNotification);
    }

    if (verbose) {
        const formattedError = formatCliError(error);
        console.error(`  ↳ Transpilation failed:\n${formattedError}`);
    } else {
        console.error(`  ↳ Transpilation failed: ${errorMessage}`);
    }
}
