const DEFAULT_HELP_FLAG = "-h, --help";
const DEFAULT_HELP_DESCRIPTION = "Show this help message.";
const DEFAULT_HELP_AFTER_ERROR = "(add --help for usage information)";

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
