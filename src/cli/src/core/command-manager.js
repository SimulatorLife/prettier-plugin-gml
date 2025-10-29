import { CliUsageError, handleCliError } from "./errors.js";
import { DEFAULT_HELP_AFTER_ERROR } from "./command-standard-options.js";
import { isCommanderErrorLike } from "./commander-error-utils.js";
import { resolveCommandUsage } from "../shared/dependencies.js";

/**
 * The earlier CLI command "manager" mixed registration APIs with the runner
 * surface. That broad contract forced consumers to depend on both concerns at
 * once even if they only needed to register commands. To honour the Interface
 * Segregation Principle we now expose narrower registry and runner views that
 * sit on top of a shared coordinator.
 */

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

function isCommanderCommandInstance(value) {
    return (
        value &&
        typeof value === "object" &&
        typeof value.helpInformation === "function"
    );
}

function resolveContextCommandFromActionArgs(actionArgs, fallbackCommand) {
    const candidate = actionArgs.at(-1);
    return isCommanderCommandInstance(candidate) ? candidate : fallbackCommand;
}

function composeUsageHelpMessage({ defaultHelpText, usage }) {
    const sections = [defaultHelpText, usage].filter(Boolean);
    return sections.length === 0 ? usage : sections.join("\n\n");
}

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
        this._defaultCommandEntry = null;
        this._activeCommand = null;
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

        this._program.hook("preSubcommand", (thisCommand, actionCommand) => {
            if (actionCommand) {
                this._activeCommand = actionCommand;
            }
        });

        this._program.hook("postAction", () => {
            this._activeCommand = null;
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
            handleError: onError,
            isDefault: true
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
            this._activeCommand = null;
            await this._program.parseAsync(argv, { from: "user" });
        } catch (error) {
            if (this._handleCommanderError(error)) {
                return;
            }
            throw error;
        }
    }

    _registerEntry(command, { run, handleError, isDefault = false } = {}) {
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
        if (isDefault) {
            this._defaultCommandEntry = entry;
        }

        if (entry.run) {
            command.action(this._createCommandAction(entry, command));
        }

        return entry;
    }

    _createCommandAction(entry, defaultCommand) {
        return async (...actionArgs) => {
            const contextCommand = resolveContextCommandFromActionArgs(
                actionArgs,
                defaultCommand
            );
            const previousActiveCommand = this._activeCommand;
            this._activeCommand = contextCommand;

            try {
                const result = await entry.run({ command: contextCommand });
                this._applyCommandResult(result);
            } catch (error) {
                this._handleCommandError(error, contextCommand);
            } finally {
                this._activeCommand = previousActiveCommand ?? null;
            }
        };
    }

    _applyCommandResult(result) {
        if (typeof result === "number") {
            process.exitCode = result;
        }
    }

    _handleCommanderError(error) {
        if (!isCommanderErrorLike(error)) {
            return false;
        }

        if (
            error.code === "commander.helpDisplayed" ||
            error.code === "commander.version"
        ) {
            return true;
        }

        const commandFromError =
            error.command ?? this._activeCommand ?? this._program;
        const resolvedCommand =
            this._resolveCommandFromCommanderError(commandFromError);
        const usageError = this._createUsageErrorFromCommanderError(
            error,
            resolvedCommand
        );
        this._handleCommandError(usageError, resolvedCommand ?? this._program);
        return true;
    }

    _handleCommandError(error, command) {
        const entry = this._commandEntryLookup.get(command);
        const handler = entry?.handleError ?? this._defaultErrorHandler;
        handler(error, { command });
    }

    _resolveCommandFromCommanderError(commandFromError) {
        if (
            commandFromError === this._program &&
            this._defaultCommandEntry?.command
        ) {
            return this._defaultCommandEntry.command;
        }

        return commandFromError ?? this._program;
    }

    _createUsageErrorFromCommanderError(error, resolvedCommand) {
        const usage = resolveCommandUsage(resolvedCommand, {
            fallback: () => this._program.helpInformation()
        });
        const normalizedUsage = composeUsageHelpMessage({
            defaultHelpText: DEFAULT_HELP_AFTER_ERROR,
            usage
        });

        return new CliUsageError(error.message.trim(), {
            usage: normalizedUsage
        });
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
