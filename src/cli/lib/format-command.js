import { Command, InvalidArgumentError, Option } from "commander";

import { normalizeEnumeratedOption } from "../../shared/utils.js";
import { wrapInvalidArgumentResolver } from "./command-parsing.js";
import {
    DEFAULT_EXTENSIONS,
    DEFAULT_PARSE_ERROR_ACTION,
    DEFAULT_PRETTIER_LOG_LEVEL,
    VALID_PARSE_ERROR_ACTIONS,
    VALID_PARSE_ERROR_ACTION_CHOICES,
    VALID_PRETTIER_LOG_LEVELS,
    VALID_PRETTIER_LOG_LEVEL_CHOICES,
    formatExtensionListForDisplay,
    normalizeExtensions
} from "./format-runner.js";
import {
    getDefaultSkippedDirectorySampleLimit,
    resolveSkippedDirectorySampleLimit,
    SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR
} from "./skipped-directory-sample-limit.js";
import { applyStandardCommandOptions } from "./command-standard-options.js";

export {
    executeFormatCommand,
    resetFormattingSession
} from "./format-runner.js";

function createExtensionsOption(defaultExtensions) {
    return new Option(
        "--extensions <list>",
        [
            "Comma-separated list of file extensions to format.",
            `Defaults to ${formatExtensionListForDisplay(defaultExtensions)}.`,
            "Respects PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS when set."
        ].join(" ")
    )
        .argParser((value) => normalizeExtensions(value, defaultExtensions))
        .default(
            defaultExtensions,
            formatExtensionListForDisplay(defaultExtensions)
        );
}

function createSkippedDirectorySampleLimitOption(defaultLimit, resolver) {
    return new Option(
        "--ignored-directory-sample-limit <count>",
        [
            "Maximum number of ignored directories to include in skip summaries.",
            `Defaults to ${defaultLimit}.`,
            "Alias: --ignored-directory-samples.",
            `Respects ${SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR} when set. Provide 0 to suppress the sample list.`
        ].join(" ")
    )
        .argParser(wrapInvalidArgumentResolver(resolver))
        .default(defaultLimit, String(defaultLimit));
}

function createSkippedDirectorySamplesAliasOption(resolver) {
    return new Option(
        "--ignored-directory-samples <count>",
        "Alias for --ignored-directory-sample-limit <count>."
    )
        .argParser(wrapInvalidArgumentResolver(resolver))
        .hideHelp();
}

function createLogLevelOption() {
    return new Option(
        "--log-level <level>",
        [
            "Prettier log level to use (debug, info, warn, error, or silent).",
            "Respects PRETTIER_PLUGIN_GML_LOG_LEVEL when set."
        ].join(" ")
    )
        .argParser((value) => {
            const normalized = normalizeEnumeratedOption(
                value,
                DEFAULT_PRETTIER_LOG_LEVEL,
                VALID_PRETTIER_LOG_LEVELS
            );
            if (!normalized) {
                throw new InvalidArgumentError(
                    `Must be one of: ${VALID_PRETTIER_LOG_LEVEL_CHOICES}`
                );
            }
            return normalized;
        })
        .default(DEFAULT_PRETTIER_LOG_LEVEL);
}

function createParseErrorOption() {
    return new Option(
        "--on-parse-error <mode>",
        [
            "How to handle parser failures: revert, skip, or abort.",
            "Respects PRETTIER_PLUGIN_GML_ON_PARSE_ERROR when set."
        ].join(" ")
    )
        .argParser((value) => {
            const normalized = normalizeEnumeratedOption(
                value,
                DEFAULT_PARSE_ERROR_ACTION,
                VALID_PARSE_ERROR_ACTIONS
            );
            if (!normalized) {
                throw new InvalidArgumentError(
                    `Must be one of: ${VALID_PARSE_ERROR_ACTION_CHOICES}`
                );
            }
            return normalized;
        })
        .default(DEFAULT_PARSE_ERROR_ACTION);
}

export function createFormatCommand({ name = "prettier-plugin-gml" } = {}) {
    const defaultSkippedDirectorySampleLimit =
        getDefaultSkippedDirectorySampleLimit();
    const resolveSkippedDirectoryLimit = (value) =>
        resolveSkippedDirectorySampleLimit(value, {
            defaultLimit: defaultSkippedDirectorySampleLimit
        });

    return applyStandardCommandOptions(
        new Command()
            .name(name)
            .usage("[options] [path]")
            .description(
                "Format GameMaker Language files using the prettier plugin."
            )
    )
        .argument(
            "[targetPath]",
            "Directory or file to format. Defaults to the current working directory."
        )
        .option(
            "--path <path>",
            "Directory or file to format (alias for positional argument)."
        )
        .addOption(createExtensionsOption(DEFAULT_EXTENSIONS))
        .addOption(
            createSkippedDirectorySampleLimitOption(
                defaultSkippedDirectorySampleLimit,
                resolveSkippedDirectoryLimit
            )
        )
        .addOption(
            createSkippedDirectorySamplesAliasOption(
                resolveSkippedDirectoryLimit
            )
        )
        .addOption(createLogLevelOption())
        .addOption(createParseErrorOption());
}
