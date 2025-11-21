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

import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { FSWatcher } from "node:fs";

import { Command, Option } from "commander";

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
    type RuntimeServerController,
    type RuntimeStaticServerOptions
} from "../modules/runtime/server.js";
import {
    startPatchWebSocketServer,
    type PatchWebSocketServerController
} from "../modules/websocket/server.js";

interface TranspilerPatch {
    kind: string;
    id: string;
    js_body: string;
    sourceText: string;
    version: number;
}

interface WatchTranspiler {
    transpileScript(request: {
        sourceText: string;
        symbolId: string;
    }): Promise<TranspilerPatch>;
}


type RuntimeDescriptorFormatter = (source: RuntimeSourceDescriptor) => string;

interface WatchCommandOptions {
    extensions?: Array<string>;
    polling?: boolean;
    pollingInterval?: number;
    verbose?: boolean;
    websocketPort?: number;
    websocketHost?: string;
    websocketServer?: boolean;
    runtimeRoot?: string;
    runtimePackage?: string;
    runtimeServer?: boolean;
    hydrateRuntime?: boolean;
    runtimeResolver?: RuntimeSourceResolver;
    runtimeDescriptor?: RuntimeDescriptorFormatter;
    runtimeServerStarter?: typeof startRuntimeStaticServer;
    abortSignal?: AbortSignal;
}

interface RuntimeContext {
    root: string | null;
    packageName: string | null;
    packageJson: Record<string, unknown> | null;
    server: RuntimeServerController | null;
    noticeLogged: boolean;
    transpiler: WatchTranspiler;
    patches: Array<TranspilerPatch>;
    websocketServer: PatchWebSocketServerController | null;
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
            console.error(`Error: ${normalizedPath} is not a directory`);
            process.exit(1);
        }
    } catch (error) {
        console.error(`Error: Cannot access ${normalizedPath}`);
        console.error(error.message);
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
        runtimeServerStarter = startRuntimeStaticServer
    } = options;

    const normalizedPath = await validateTargetPath(targetPath);

    const extensionSet = new Set(
        extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`))
    );

    const shouldServeRuntime =
        hydrateRuntime === undefined
            ? runtimeServer !== false
            : Boolean(hydrateRuntime);

    const transpiler = Transpiler.createTranspiler() as WatchTranspiler;
    const runtimeContext: RuntimeContext = {
        root: null,
        packageName: null,
        packageJson: null,
        server: null,
        noticeLogged: Boolean(verbose),
        transpiler,
        patches: [],
        websocketServer: null
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
                onClientConnect: (clientId) => {
                    if (verbose) {
                        console.log(
                            `Patch streaming client connected: ${clientId}`
                        );
                    }
                },
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
            console.error(`Failed to start WebSocket server: ${error.message}`);
            if (verbose) {
                console.error(error.stack);
            }
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

    const watchOptions: { recursive: true; persistent?: boolean } = {
        recursive: true,
        ...(polling && { persistent: true })
    };
    let watcher: FSWatcher | null = null;
    let resolved = false;

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

            if (runtimeServerController) {
                try {
                    await runtimeServerController.stop();
                } catch (error) {
                    console.error(
                        `Failed to stop runtime static server: ${error.message}`
                    );
                }
            }

            if (websocketServerController) {
                try {
                    await websocketServerController.stop();
                } catch (error) {
                    console.error(
                        `Failed to stop WebSocket server: ${error.message}`
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

        const handleErrorSignal = () => {
            cleanup(0).catch((error) => {
                console.error(`Error during watch cleanup: ${error.message}`);
                process.exit(1);
            });
        };

        process.on("SIGINT", handleErrorSignal);
        process.on("SIGTERM", handleErrorSignal);

        if (abortSignal) {
            if (abortSignal.aborted) {
                cleanup(0);
                return;
            }

            const abortHandler = () => {
                cleanup(0).catch((error) => {
                    console.error(
                        `Error during watch cleanup: ${error.message}`
                    );
                });
            };

            abortSignal.addEventListener("abort", abortHandler, {
                once: true
            });

            removeAbortListener = () => {
                abortSignal.removeEventListener("abort", abortHandler);
            };
        }

        watcher = watch(
            normalizedPath,
            {
                ...watchOptions,
                ...(abortSignal && { signal: abortSignal })
            },
            (eventType, filename) => {
                if (!filename || !extensionSet.has(path.extname(filename))) {
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

                // Future: Trigger transpiler, semantic analysis, and patch streaming
                // For now, we just detect and report changes
                handleFileChange(fullPath, eventType, {
                    verbose,
                    runtimeContext
                }).catch((error) => {
                    console.error(
                        `Error processing ${filename}:`,
                        error.message
                    );
                });
            }
        );
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
            if (runtimeContext?.transpiler) {
                try {
                    // Generate a script identifier from the file path
                    const fileName = path.basename(
                        filePath,
                        path.extname(filePath)
                    );
                    const symbolId = `gml/script/${fileName}`;

                    // Transpile to JavaScript patch
                    const patch =
                        await runtimeContext.transpiler.transpileScript({
                            sourceText: content,
                            symbolId
                        });

                    // Store the patch for future streaming
                    runtimeContext.patches.push(patch);

                    // Broadcast the patch to all connected WebSocket clients
                    if (runtimeContext.websocketServer) {
                        const broadcastResult =
                            runtimeContext.websocketServer.broadcast(patch);

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

                    if (verbose) {
                        console.log(
                            `  ↳ Transpiled to JavaScript (${patch.js_body.length} chars)`
                        );
                        console.log(`  ↳ Patch ID: ${patch.id}`);
                    } else {
                        console.log(`  ↳ Generated patch: ${patch.id}`);
                    }

                    // Future integration points:
                    // 1. Run semantic analysis to understand scope and dependencies
                    // 2. Identify dependent scripts that need recompilation
                } catch (error) {
                    console.error(`  ↳ Transpilation failed: ${error.message}`);
                    if (verbose) {
                        console.error(`     ${error.stack}`);
                    }
                }
            }
        } catch (error) {
            if (verbose) {
                console.log(`  ↳ Error reading file: ${error.message}`);
            }
        }
    }
}
