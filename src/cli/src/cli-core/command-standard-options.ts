import { Core } from "@gml-modules/core";
import type { CommanderCommandLike } from "./commander-types.js";

const { noop } = Core;

const DEFAULT_HELP_FLAG = "-h, --help";
const DEFAULT_HELP_DESCRIPTION = "Show this help message.";
const DEFAULT_HELP_AFTER_ERROR = "(add --help for usage information)";

/**
 * Enable the shared help/exit behaviour that every CLI command consumes.
 *
 * Commander exposes its API through a mutable `Command` instance which the
 * loader wires together once at startup. The helper asserts a compatible
 * instance is supplied, applies the formatter's standard help options, and
 * returns the same command so call sites can continue chaining additional
 * configuration without re-validating the object.
 *
 * @template {import("commander").Command} TCommand
 * @param {TCommand} command Commander command that should expose the standard
 *        help semantics.
 * @returns {TCommand} The original command for fluent chaining.
 */
export function applyStandardCommandOptions<TCommand extends CommanderCommandLike>(command: TCommand): TCommand {
    if (!command || typeof command.exitOverride !== "function") {
        throw new TypeError("applyStandardCommandOptions expects a Commander Command instance.");
    }

    command.exitOverride();
    command.allowExcessArguments(false);
    command.helpOption(DEFAULT_HELP_FLAG, DEFAULT_HELP_DESCRIPTION);
    command.showHelpAfterError(DEFAULT_HELP_AFTER_ERROR);
    if (typeof command.configureOutput === "function") {
        // The CLI funnels usage and execution failures through
        // Silence Commander's default error/help output to avoid duplication.
        // The CLI's `CliCommandManager.handleCliError` integration formats all
        // diagnostics with a structured renderer (see src/cli/src/cli-core/errors.js),
        // ensuring errors appear exactly once with consistent styling. If we left
        // Commander's default `writeErr` and `outputError` callbacks in place,
        // it would emit its own error preface before our handler runs, leading to
        // duplicated stderr messages and mismatched help text whenever `exitOverride()`
        // surfaces a usage problem. Replacing these callbacks with no-ops keeps
        // Commander quiet while honoring its internal contract (it expects these
        // writers to exist). Conditionals or missing callbacks would break the
        // single-source-of-truth messaging design documented in
        // README.md#cli-wrapper-environment-knobs.
        command.configureOutput({
            writeErr: noop,
            outputError: noop
        });
    }

    return command;
}

export { DEFAULT_HELP_FLAG, DEFAULT_HELP_DESCRIPTION, DEFAULT_HELP_AFTER_ERROR };
