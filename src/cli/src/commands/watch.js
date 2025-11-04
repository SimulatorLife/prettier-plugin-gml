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

import { Command, Option } from "commander";
import GMLParser from "../../../parser/src/gml-parser.js";

/**
 * Creates the watch command for monitoring GML source files.
 *
 * @returns {Command} Commander command instance
 */
export function createWatchCommand() {
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
                    const parsed = Number.parseInt(value, 10);
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
                "--parse",
                "Parse changed files and report syntax errors"
            ).default(false)
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
async function validateTargetPath(targetPath) {
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
 * @param {boolean} parse - Whether to parse changed files
 */
function logWatchStartup(
    targetPath,
    extensions,
    polling,
    pollingInterval,
    verbose,
    parse
) {
    if (verbose) {
        console.log(`Watching: ${targetPath}`);
        console.log(`Extensions: ${[...extensions].join(", ")}`);
        console.log(`Mode: ${polling ? "polling" : "native"}`);
        if (polling) {
            console.log(`Polling interval: ${pollingInterval}ms`);
        }
        console.log(`Parse on change: ${parse ? "enabled" : "disabled"}`);
        console.log("\nWaiting for file changes... (Press Ctrl+C to stop)\n");
    } else {
        console.log(`Watching ${targetPath} for changes...`);
        if (parse) {
            console.log("Parser validation enabled");
        }
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
 * @param {boolean} options.parse - Parse changed files and report syntax errors
 */
export async function runWatchCommand(targetPath, options) {
    const {
        extensions = [".gml"],
        polling = false,
        pollingInterval = 1000,
        verbose = false,
        parse = false
    } = options;

    const normalizedPath = await validateTargetPath(targetPath);

    const extensionSet = new Set(
        extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`))
    );

    logWatchStartup(
        normalizedPath,
        extensionSet,
        polling,
        pollingInterval,
        verbose,
        parse
    );

    const watchOptions = {
        recursive: true,
        ...(polling && { persistent: true })
    };

    const watcher = watch(
        normalizedPath,
        watchOptions,
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
            handleFileChange(fullPath, eventType, { verbose, parse }).catch(
                (error) => {
                    console.error(
                        `Error processing ${filename}:`,
                        error.message
                    );
                }
            );
        }
    );

    // Handle termination
    const cleanup = () => {
        if (verbose) {
            console.log("\nStopping watcher...");
        }
        watcher.close();
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Keep the process alive
    return new Promise(() => {
        // This promise never resolves; the watcher runs until interrupted
    });
}

/**
 * Handles individual file change events.
 *
 * This function will be extended to coordinate with the transpiler, semantic analyzer,
 * and runtime wrapper as the hot-reload pipeline matures.
 *
 * @param {string} filePath - Full path to the changed file
 * @param {string} eventType - Type of file system event ('change' or 'rename')
 * @param {object} options - Processing options
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {boolean} options.parse - Parse the file and report syntax errors
 */
async function handleFileChange(
    filePath,
    eventType,
    { verbose = false, parse = false } = {}
) {
    if (eventType === "rename") {
        // File was created, deleted, or renamed
        try {
            await stat(filePath);
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

    // For 'change' events, we can attempt to read the file
    if (eventType === "change") {
        try {
            const content = await readFile(filePath, "utf8");
            const lines = content.split("\n").length;

            if (verbose) {
                console.log(`  ↳ Read ${lines} lines`);
            }

            // Integration point 1: Parse the file using the ANTLR parser (src/parser)
            if (parse) {
                await parseFile(filePath, content, { verbose });
            }

            // Future integration points:
            // 2. Run semantic analysis (src/semantic)
            // 3. Generate transpiler patches (src/transpiler)
            // 4. Stream patches to runtime wrapper (src/runtime-wrapper)
        } catch (error) {
            if (verbose) {
                console.log(`  ↳ Error reading file: ${error.message}`);
            }
        }
    }
}

/**
 * Parses a GML file and reports any syntax errors.
 *
 * This is the first integration point with the hot-reload pipeline,
 * establishing the foundation for semantic analysis and transpilation.
 *
 * @param {string} filePath - Path to the file being parsed
 * @param {string} content - File content to parse
 * @param {object} options - Parsing options
 * @param {boolean} options.verbose - Enable verbose logging
 */
async function parseFile(filePath, content, { verbose = false } = {}) {
    try {
        const parser = new GMLParser(content, {
            getComments: false,
            getLocations: false,
            simplifyLocations: false
        });

        const _ast = parser.parse();

        if (verbose) {
            console.log(`  ↳ ✓ Parse successful`);
        } else {
            console.log(`  ✓ Parse OK`);
        }
    } catch (error) {
        console.error(`  ✗ Parse error in ${path.basename(filePath)}:`);
        if (error.message) {
            console.error(`    ${error.message}`);
        }
        if (verbose && error.stack) {
            console.error(`    Stack: ${error.stack}`);
        }
    }
}
