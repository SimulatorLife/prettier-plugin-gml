import { CliUsageError, handleCliError } from "./cli-errors.js";
import { isCommanderErrorLike } from "./commander-error-utils.js";

/**
 * @typedef {{
 *   command: import("commander").Command,
 *   run?: (context: { command: import("commander").Command }) =>
 *       Promise<number | void> | number | void,
 *   onError?: (error: unknown, context: { command: import("commander").Command }) => void
 * }} CliCommandRegistrationOptions
 */

/**
 * @typedef {object} CliCommandRegistry
 * @property {(options: CliCommandRegistrationOptions) => object} registerDefaultCommand
 * @property {(options: CliCommandRegistrationOptions) => object} registerCommand
 */

/**
 * @typedef {object} CliCommandRunner
 * @property {(argv: Array<string>) => Promise<void>} run
 */

class CliCommandManager {
    /**
     * @param {{
     *   program: import("commander").Command,
     *   onUnhandledError?: (error: unknown, context: { command: import("commander").Command }) => void
     * }} options
     */
    constructor({ program, onUnhandledError } = {}) {
        if (!program || typeof program.parseAsync !== "function") {
            throw new TypeError(
                "CliCommandManager requires a Commander program instance."
            );
        }

        this._program = program;
        this._entries = new Set();
        this._commandEntryLookup = new WeakMap();
        this._defaultErrorHandler =
            typeof onUnhandledError === "function"
                ? onUnhandledError
                : (error) =>
                      handleCliError(error, {
                          prefix: "Failed to run CLI command.",
                          exitCode: 1
                      });

        this._registerEntry(program, {
            handleError: this._defaultErrorHandler
        });
    }

    /**
     * Register the default command used when no subcommand is provided.
     *
     * @param {CliCommandRegistrationOptions} options
     */
    registerDefaultCommand({ command, run, onError } = {}) {
        const entry = this._registerEntry(command, {
            run,
            handleError: onError
        });
        this._program.addCommand(command, { isDefault: true });
        return entry;
    }

    /**
     * Register an additional subcommand with the CLI.
     *
     * @param {CliCommandRegistrationOptions} options
     */
    registerCommand({ command, run, onError } = {}) {
        const entry = this._registerEntry(command, {
            run,
            handleError: onError
        });
        this._program.addCommand(command);
        return entry;
    }

    /**
     * Execute the registered CLI program with the provided argv.
     *
     * @param {Array<string>} argv
     */
    async run(argv) {
        try {
            await this._program.parseAsync(argv, { from: "user" });
        } catch (error) {
            if (this._handleCommanderError(error)) {
                return;
            }
            throw error;
        }
    }

    _registerEntry(command, { run, handleError } = {}) {
        if (!command || typeof command.name !== "function") {
            throw new TypeError(
                "registerCommand expects a Commander Command instance."
            );
        }
        if (run && typeof run !== "function") {
            throw new TypeError("Command run handlers must be functions.");
        }

        const entry = {
            command,
            run: run ?? null,
            handleError:
                typeof handleError === "function"
                    ? handleError
                    : this._defaultErrorHandler
        };

        this._entries.add(entry);
        this._commandEntryLookup.set(command, entry);

        if (entry.run) {
            command.action(async (...actionArgs) => {
                const invokedCommand = actionArgs.at(-1);
                const contextCommand =
                    invokedCommand &&
                    typeof invokedCommand.helpInformation === "function"
                        ? invokedCommand
                        : command;
                try {
                    const result = await entry.run({ command: contextCommand });
                    if (typeof result === "number") {
                        process.exitCode = result;
                    }
                } catch (error) {
                    this._handleCommandError(error, contextCommand);
                }
            });
        }

        return entry;
    }

    _handleCommanderError(error) {
        if (!isCommanderErrorLike(error)) {
            return false;
        }

        if (error.code === "commander.helpDisplayed") {
            return true;
        }

        const command = error.command ?? this._program;
        const usage =
            typeof command?.helpInformation === "function"
                ? command.helpInformation()
                : this._program.helpInformation();
        const usageError = new CliUsageError(error.message.trim(), { usage });
        this._handleCommandError(usageError, command);
        return true;
    }

    _handleCommandError(error, command) {
        const entry = this._commandEntryLookup.get(command);
        const handler = entry?.handleError ?? this._defaultErrorHandler;
        handler(error, { command });
    }
}

export { CliCommandManager };

/**
 * @param {{
 *   program: import("commander").Command,
 *   onUnhandledError?: (error: unknown, context: { command: import("commander").Command }) => void
 * }} options
 * @returns {{ registry: CliCommandRegistry, runner: CliCommandRunner }}
 */
export function createCliCommandManager(options) {
    const manager = new CliCommandManager(options);
    return Object.freeze({
        registry: Object.freeze({
            registerDefaultCommand:
                manager.registerDefaultCommand.bind(manager),
            registerCommand: manager.registerCommand.bind(manager)
        }),
        runner: Object.freeze({
            run: manager.run.bind(manager)
        })
    });
}
