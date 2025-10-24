/**
 * Command-line interface for running utilities for this project.
 *
 * Commands provided include:
 * - A wrapper around the GML-Prettier plugin to provide a convenient
 *   way to format GameMaker Language files.
 * - Performance benchmarking utilities.
 * - Memory usage benchmarking utilities.
 * - Regression testing utilities.
 * - Generating/retrieving GML identifiers and Feather metadata.
 *
 * This CLI is primarily intended for use in development and CI environments.
 * For formatting GML files, it is recommended to use the Prettier CLI or
 * editor integrations directly.
 */

import process from "node:process";

import { Command } from "commander";

import { handleCliError } from "./lib/cli-errors.js";
import { applyStandardCommandOptions } from "./lib/command-standard-options.js";
import { createCliCommandManager } from "./lib/cli-command-manager.js";
import { resolveCliVersion } from "./lib/cli-version.js";
import {
    createFormatCommand,
    executeFormatCommand,
    resetFormattingSession
} from "./lib/format-command.js";
import {
    createPerformanceCommand,
    runPerformanceCommand
} from "./lib/performance-cli.js";
import { createMemoryCommand, runMemoryCommand } from "./lib/memory-cli.js";
import {
    createGenerateIdentifiersCommand,
    runGenerateGmlIdentifiers
} from "./commands/generate-gml-identifiers.js";
import {
    createFeatherMetadataCommand,
    runGenerateFeatherMetadata
} from "./commands/generate-feather-metadata.js";

const program = applyStandardCommandOptions(new Command())
    .name("prettier-plugin-gml")
    .usage("[command] [options]")
    .description(
        [
            "Utilities for working with the prettier-plugin-gml project.",
            "Provides formatting, benchmarking, and manual data generation commands."
        ].join(" \n")
    )
    .version(
        resolveCliVersion(),
        "-V, --version",
        "Show CLI version information."
    );

const { registry: cliCommandRegistry, runner: cliCommandRunner } =
    createCliCommandManager({
        program,
        onUnhandledError: (error) =>
            handleCliError(error, {
                prefix: "Failed to run prettier-plugin-gml CLI.",
                exitCode: 1
            })
    });

function normalizeCommandLineArguments(argv) {
    if (!Array.isArray(argv)) {
        return [];
    }

    if (argv.length === 0) {
        return [];
    }

    if (argv[0] !== "help") {
        return [...argv];
    }

    if (argv.length === 1) {
        return ["--help"];
    }

    return [...argv.slice(1), "--help"];
}

export const __test__ = Object.freeze({
    resetFormattingSessionForTests: resetFormattingSession,
    normalizeCommandLineArguments
});

const formatCommand = createFormatCommand({ name: "format" });

cliCommandRegistry.registerDefaultCommand({
    command: formatCommand,
    run: ({ command }) => executeFormatCommand(command),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to format project.",
            exitCode: 1
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
    command: createFeatherMetadataCommand({ env: process.env }),
    run: ({ command }) => runGenerateFeatherMetadata({ command }),
    onError: (error) =>
        handleCliError(error, {
            prefix: "Failed to generate Feather metadata.",
            exitCode: 1
        })
});

if (process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN !== "1") {
    const normalizedArguments = normalizeCommandLineArguments(
        process.argv.slice(2)
    );

    try {
        await cliCommandRunner.run(normalizedArguments);
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to run prettier-plugin-gml CLI.",
            exitCode: 1
        });
    }
}
