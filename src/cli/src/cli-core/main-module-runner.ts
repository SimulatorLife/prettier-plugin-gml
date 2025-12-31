import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { createCliCommandManager } from "./command-manager.js";
import { handleCliError } from "./errors.js";
import type { CommanderCommandLike } from "./commander-types.js";

/**
 * Configuration for running a CLI command as a main module.
 */
export interface RunAsMainModuleOptions {
    /**
     * The name of the command program (e.g., "generate-feather-metadata").
     */
    programName: string;

    /**
     * Factory function that creates the CLI command.
     */
    createCommand: (options?: {
        env?: NodeJS.ProcessEnv;
    }) => CommanderCommandLike;

    /**
     * Function that executes the command logic.
     */
    run: (context: {
        command: CommanderCommandLike;
    }) => number | void | Promise<number | void>;

    /**
     * Error message prefix for the command (e.g., "Failed to generate Feather metadata.").
     */
    errorPrefix: string;

    /**
     * Optional environment variables to pass to the command factory.
     * Only passed if the createCommand function requires it.
     */
    env?: NodeJS.ProcessEnv;

    /**
     * Whether to pass options to createCommand. When false, createCommand is called with no arguments.
     * Defaults to true when env is provided, false otherwise.
     */
    passOptionsToCreateCommand?: boolean;
}

/**
 * Determines whether the current module is being executed as the main module.
 *
 * @param importMetaUrl - The import.meta.url of the calling module.
 * @returns `true` if the current module is the main module being executed.
 */
export function isMainModule(importMetaUrl: string): boolean {
    const resolvedMainPath = process.argv[1]
        ? path.resolve(process.argv[1])
        : null;
    const resolvedModulePath = fileURLToPath(importMetaUrl);
    return resolvedMainPath === resolvedModulePath;
}

/**
 * Execute a CLI command when the module is run as the main entry point.
 *
 * This helper consolidates the boilerplate pattern used across CLI commands
 * that support both module import and direct execution. It handles:
 * - Creating a Commander program with the specified name
 * - Setting up the CLI command manager and registry
 * - Configuring error handling with the appropriate prefix
 * - Registering and running the command
 *
 * @param options - Configuration for the main module execution.
 *
 * @example
 * ```ts
 * // Command that requires env
 * if (isMainModule(import.meta.url)) {
 *     runAsMainModule({
 *         programName: "generate-gml-identifiers",
 *         createCommand: createGenerateIdentifiersCommand,
 *         run: ({ command }) => runGenerateGmlIdentifiers({ command }),
 *         errorPrefix: "Failed to generate GML identifiers.",
 *         env: process.env
 *     });
 * }
 *
 * // Command that doesn't need env
 * if (isMainModule(import.meta.url)) {
 *     runAsMainModule({
 *         programName: "generate-feather-metadata",
 *         createCommand: createFeatherMetadataCommand,
 *         run: ({ command }) => runGenerateFeatherMetadata({ command }),
 *         errorPrefix: "Failed to generate Feather metadata."
 *     });
 * }
 * ```
 */
export function runAsMainModule({
    programName,
    createCommand,
    run,
    errorPrefix,
    env,
    passOptionsToCreateCommand
}: RunAsMainModuleOptions): void {
    const program = new Command().name(programName);
    const { registry, runner } = createCliCommandManager({ program });

    const handleError = (error: unknown) =>
        handleCliError(error, {
            prefix: errorPrefix,
            exitCode:
                typeof (error as { exitCode?: number })?.exitCode === "number"
                    ? (error as { exitCode: number }).exitCode
                    : 1
        });

    const shouldPassOptions = passOptionsToCreateCommand ?? env !== undefined;
    const command = shouldPassOptions
        ? createCommand({ env: env ?? process.env })
        : createCommand();

    registry.registerDefaultCommand({
        command,
        run,
        onError: handleError
    });

    runner.run(process.argv.slice(2)).catch(handleError);
}
