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
export function applyStandardCommandOptions(command) {
    if (!command || typeof command.exitOverride !== "function") {
        throw new TypeError(
            "applyStandardCommandOptions expects a Commander Command instance."
        );
    }

    command.exitOverride();
    command.allowExcessArguments(false);
    command.helpOption(DEFAULT_HELP_FLAG, DEFAULT_HELP_DESCRIPTION);
    command.showHelpAfterError(DEFAULT_HELP_AFTER_ERROR);

    return command;
}

export {
    DEFAULT_HELP_FLAG,
    DEFAULT_HELP_DESCRIPTION,
    DEFAULT_HELP_AFTER_ERROR
};
