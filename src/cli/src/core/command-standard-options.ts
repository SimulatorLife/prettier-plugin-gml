import type { Command } from "commander";

import { Core } from "@gml-modules/core";

const {
    Utils: { noop }
} = Core;

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
export function applyStandardCommandOptions<TCommand extends Command>(
    command: TCommand
): TCommand {
    if (!command || typeof command.exitOverride !== "function") {
        throw new TypeError(
            "applyStandardCommandOptions expects a Commander Command instance."
        );
    }

    command.exitOverride();
    command.allowExcessArguments(false);
    command.helpOption(DEFAULT_HELP_FLAG, DEFAULT_HELP_DESCRIPTION);
    command.showHelpAfterError(DEFAULT_HELP_AFTER_ERROR);
    if (typeof command.configureOutput === "function") {
        // The CLI funnels usage and execution failures through
        // `CliCommandManager`'s `handleCliError` integration so diagnostics are
        // formatted exactly once with the formatter's structured renderer (see
        // `src/cli/src/core/errors.js`). Commander would otherwise emit its own
        // error preface before our handler runs, leading to duplicated stderr
        // output and mismatched help text whenever `exitOverride()` surfaces a
        // usage problem. Returning shared noop callbacks keeps Commander quiet
        // while preserving the "always call the provided writers" contract its
        // internals expect; swapping these for conditionals or letting the
        // defaults leak would regress the single-source-of-truth messaging the
        // CLI design calls out in README.md#cli-wrapper-environment-knobs.
        command.configureOutput({
            writeErr: noop,
            outputError: noop
        });
    }

    return command;
}

export {
    DEFAULT_HELP_FLAG,
    DEFAULT_HELP_DESCRIPTION,
    DEFAULT_HELP_AFTER_ERROR
};
