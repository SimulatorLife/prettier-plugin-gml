/**
 * Command-line interface for running utilities for this project.
 *
 * Commands provided include:
 * - A wrapper around the GML-Prettier plugin to provide a convenient
 *   way to format GameMaker Language files.
 * - Watch mode for monitoring GML source files and coordinating the
 *   hot-reload pipeline (transpiler, semantic analysis, patch streaming).
 * - Performance benchmarking utilities.
 * - Memory usage benchmarking utilities.
 * - Regression testing utilities.
 * - Generating/retrieving GML identifiers and Feather metadata (via the GameMaker manual).
 *
 * This CLI is primarily intended for use in development and CI environments.
 * For formatting GML files, it is recommended to use the Prettier CLI or
 * editor integrations directly.
 */

import process from "node:process";

import { Core } from "@gml-modules/core";
import { Command } from "commander";

import { createCliCommandManager } from "./cli-core/command-manager.js";
import { applyStandardCommandOptions } from "./cli-core/command-standard-options.js";
import { handleCliError } from "./cli-core/errors.js";
import { resolveCliVersion } from "./cli-core/version.js";
import { createCollectStatsCommand, runCollectStats } from "./commands/collect-stats.js";
import { __formatTest__, createFormatCommand, runFormatCommand } from "./commands/format.js";
import { createFeatherMetadataCommand, runGenerateFeatherMetadata } from "./commands/generate-feather-metadata.js";
import { createGenerateIdentifiersCommand, runGenerateGmlIdentifiers } from "./commands/generate-gml-identifiers.js";
import { createGenerateQualityReportCommand, runGenerateQualityReport } from "./commands/generate-quality-report.js";
import { createLintCommand, runLintCommand } from "./commands/lint.js";
import { createMemoryCommand, runMemoryCommand } from "./commands/memory.js";
import { createPerformanceCommand, runPerformanceCommand } from "./commands/performance.js";
import { createPrepareHotReloadCommand, runPrepareHotReloadCommand } from "./commands/prepare-hot-reload.js";
import { createRefactorCommand, runRefactorCommand } from "./commands/refactor.js";
import { createWatchCommand, runWatchCommand } from "./commands/watch.js";
import { createWatchStatusCommand, runWatchStatusCommand } from "./commands/watch-status.js";
import { isCliRunSkipped, SKIP_CLI_RUN_ENV_VAR } from "./shared/skip-cli-run.js";

function normalizeWriteChunk(chunk: string | Uint8Array, encoding?: BufferEncoding): string {
    return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(encoding);
}

const { isNonEmptyArray } = Core;

const FORMAT_ACTION = "format";
const HELP_ACTION = "help";

function resolveDefaultAction() {
    return process.env.PRETTIER_PLUGIN_GML_DEFAULT_ACTION === FORMAT_ACTION ? FORMAT_ACTION : HELP_ACTION;
}

function normalizeCommandLineArguments(argv) {
    const normalizedArgs = normalizeArgumentList(argv);
    const withoutSeparator = stripLeadingArgumentSeparator(normalizedArgs);
    return resolveHelpAliasArguments(withoutSeparator);
}

function normalizeArgumentList(argv) {
    return isNonEmptyArray(argv) ? [...argv] : [];
}

function stripLeadingArgumentSeparator(args) {
    // Some package managers (like pnpm) may inject a leading '--' separator
    // when passing arguments to a script. If we see this as the first argument,
    // we strip it so Commander can correctly identify subcommands and options
    // instead of treating them as positional arguments.
    return args[0] === "--" ? args.slice(1) : args;
}

function resolveHelpAliasArguments(args) {
    if (args.length === 0) {
        // When no arguments are provided, default behavior depends on
        // PRETTIER_PLUGIN_GML_DEFAULT_ACTION environment variable.
        // Default is to show help (user-friendly for first-time users).
        // Set PRETTIER_PLUGIN_GML_DEFAULT_ACTION to "format" for legacy behavior.
        return resolveDefaultAction() === FORMAT_ACTION ? [] : ["--help"];
    }

    if (isStandaloneHelpRequest(args)) {
        return ["--help"];
    }

    if (!isHelpAliasCommand(args)) {
        return args;
    }

    return resolveHelpAliasCommandArguments(args);
}

function isHelpRequest(input: unknown): boolean {
    if (typeof input !== "string") {
        return false;
    }

    const normalized = input.trim().toLowerCase();
    return normalized === "--help" || normalized === "-h" || normalized === "help";
}

function isStandaloneHelpRequest(args) {
    return args.length === 1 && isHelpRequest(args[0]);
}

function isHelpAliasCommand(args) {
    return args[0] === "help";
}

function resolveHelpAliasCommandArguments(args) {
    if (args.length === 1) {
        return ["--help"];
    }

    return [...args.slice(1), "--help"];
}

const program = applyStandardCommandOptions(new Command())
    .name("prettier-plugin-gml")
    .usage("[command] [options]")
    .description(
        [
            "Utilities for working with the prettier-plugin-gml project.",
            "Provides formatting, benchmarking, and manual data generation commands.",
            resolveDefaultAction() === FORMAT_ACTION
                ? `Defaults to running the ${FORMAT_ACTION} command when no command is provided.`
                : `Run with a command name to get started (e.g., '${FORMAT_ACTION} --help' for formatting options).`
        ].join(" \n")
    )
    .version(resolveCliVersion(), "-V, --version", "Show CLI version information.");

export const { registry: cliCommandRegistry, runner: cliCommandRunner } = createCliCommandManager({
    program,
    onUnhandledError: (error) =>
        handleCliError(error, {
            prefix: "Failed to run prettier-plugin-gml CLI.",
            exitCode: 1
        })
});

export { normalizeCommandLineArguments };

class CliTestExit extends Error {
    public readonly exitCode: number;

    constructor(exitCode: number) {
        super(`Cli test exit (${exitCode})`);
        this.exitCode = exitCode;
    }
}

export interface RunCliTestCommandOptions {
    argv?: Array<string>;
    env?: NodeJS.ProcessEnv;
    cwd?: string | URL;
}

type ConsoleMethodSnapshot = {
    debug: typeof console.debug;
    error: typeof console.error;
    warn: typeof console.warn;
    log: typeof console.log;
    info: typeof console.info;
};

function captureConsoleMethods(): ConsoleMethodSnapshot {
    return {
        debug: console.debug,
        error: console.error,
        warn: console.warn,
        log: console.log,
        info: console.info
    };
}

function restoreConsoleMethods(snapshot: ConsoleMethodSnapshot): void {
    console.debug = snapshot.debug;
    console.error = snapshot.error;
    console.warn = snapshot.warn;
    console.log = snapshot.log;
    console.info = snapshot.info;
}

export async function runCliTestCommand({ argv = [], env = {}, cwd }: RunCliTestCommandOptions = {}) {
    const originalEnvValues = new Map<string, string | undefined>();
    const envOverrides = {
        ...env,
        [SKIP_CLI_RUN_ENV_VAR]: "1"
    };
    const originalConsoleMethods = captureConsoleMethods();

    for (const key of Object.keys(envOverrides)) {
        originalEnvValues.set(key, process.env[key]);
        if (envOverrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = envOverrides[key];
        }
    }

    const originalCwd = process.cwd();
    const normalizedCwd =
        typeof cwd === "string" ? cwd : typeof cwd?.toString === "function" ? cwd.toString() : undefined;
    if (normalizedCwd) {
        process.chdir(normalizedCwd);
    }

    const capturedStdout: Array<string> = [];
    const capturedStderr: Array<string> = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    const createCaptureWrite =
        (target: Array<string>): typeof process.stdout.write =>
        (chunk, encodingOrCallback?, callback?) => {
            const encoding =
                typeof encodingOrCallback === "string" ? (encodingOrCallback as BufferEncoding) : undefined;
            const text = normalizeWriteChunk(chunk as string | Uint8Array, encoding);
            target.push(text);

            const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

            if (typeof cb === "function") {
                cb();
            }

            return true;
        };

    process.stdout.write = createCaptureWrite(capturedStdout);
    process.stderr.write = createCaptureWrite(capturedStderr);

    const originalExit = process.exit.bind(process);
    let exitCode = 0;
    process.exit = ((code = 0) => {
        exitCode = Number.isNaN(Number(code)) ? 0 : Number(code);
        throw new CliTestExit(exitCode);
    }) as typeof process.exit;
    process.exitCode = 0;

    try {
        const normalizedArgs = normalizeCommandLineArguments(argv);
        await cliCommandRunner.run(normalizedArgs);
        exitCode = typeof process.exitCode === "number" && !Number.isNaN(process.exitCode) ? process.exitCode : 0;
    } catch (error) {
        if (error instanceof CliTestExit) {
            exitCode = error.exitCode;
        } else {
            throw error;
        }
    } finally {
        process.exit = originalExit;
        process.exitCode = 0;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        restoreConsoleMethods(originalConsoleMethods);

        if (normalizedCwd) {
            process.chdir(originalCwd);
        }

        for (const [key, value] of originalEnvValues.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }

    return {
        exitCode,
        stdout: capturedStdout.join(""),
        stderr: capturedStderr.join("")
    };
}

export const __test__ = Object.freeze({
    ...__formatTest__,
    normalizeCommandLineArguments
});

const formatCommand = createFormatCommand({ name: FORMAT_ACTION });

cliCommandRegistry.registerDefaultCommand({
    command: formatCommand,
    run: ({ command }) => runFormatCommand(command),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to format project.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createLintCommand(),
    run: ({ command }) => runLintCommand(command),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Lint command failed.",
            exitCode: 2
        })
});

cliCommandRegistry.registerCommand({
    command: createPerformanceCommand(),
    run: ({ command }) => runPerformanceCommand({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to run performance benchmarks.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createMemoryCommand(),
    run: ({ command }) => runMemoryCommand({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to run memory diagnostics.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createGenerateIdentifiersCommand({ env: process.env }),
    run: ({ command }) => runGenerateGmlIdentifiers({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to generate GML identifiers.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createGenerateQualityReportCommand(),
    run: ({ command }) => runGenerateQualityReport({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to generate quality report.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createCollectStatsCommand(),
    run: ({ command }) => runCollectStats({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to collect project stats.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createFeatherMetadataCommand(),
    run: ({ command }) => runGenerateFeatherMetadata({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to generate Feather metadata.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createPrepareHotReloadCommand(),
    run: ({ command }) => runPrepareHotReloadCommand(command),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to prepare hot-reload injection.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createRefactorCommand(),
    run: ({ command }) => runRefactorCommand(command.opts()),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to perform refactor operation.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createWatchCommand(),
    run: ({ command }) => runWatchCommand(command.args[0], command.opts()),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to start watch mode.",
            exitCode: 1
        })
});

cliCommandRegistry.registerCommand({
    command: createWatchStatusCommand(),
    run: ({ command }) => runWatchStatusCommand(command.opts()),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to query watch status.",
            exitCode: 1
        })
});

if (!isCliRunSkipped()) {
    const normalizedArguments = normalizeCommandLineArguments(process.argv.slice(2));

    try {
        await cliCommandRunner.run(normalizedArguments);
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to run prettier-plugin-gml CLI.",
            exitCode: 1
        });
    }
}
