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

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Command, InvalidArgumentError, Option } from "commander";
import { Core } from "@gml-modules/core";
import { createEnumeratedOptionHelpers } from "./shared/enumerated-option-helpers.js";
import { isMissingModuleDependency, resolveModuleDefaultExport } from "./shared/module.js";
import { ignoreRuleNegations } from "./shared/ignore-rules-negation-tracker.js";

import { CliUsageError, formatCliError, handleCliError } from "./cli-core/errors.js";
import { applyStandardCommandOptions } from "./cli-core/command-standard-options.js";
import { resolvePluginEntryPoint as resolveCliPluginEntryPoint } from "./plugin-runtime/entry-point.js";
import { tryAddSample } from "./cli-core/bounded-sample-collector.js";
import {
    hasRegisteredIgnorePath,
    registerIgnorePath,
    resetRegisteredIgnorePaths
} from "./shared/ignore-path-registry.js";
import { createCliCommandManager } from "./cli-core/command-manager.js";
import { resolveCliVersion } from "./cli-core/version.js";
import { wrapInvalidArgumentResolver } from "./cli-core/command-parsing.js";
import { collectFormatCommandOptions } from "./cli-core/format-command-options.js";
import { createPerformanceCommand, runPerformanceCommand } from "./commands/performance.js";
import { createMemoryCommand, runMemoryCommand } from "./modules/memory/index.js";
import { createGenerateIdentifiersCommand, runGenerateGmlIdentifiers } from "./commands/generate-gml-identifiers.js";
import { createGenerateQualityReportCommand, runGenerateQualityReport } from "./commands/generate-quality-report.js";
import { createCollectStatsCommand, runCollectStats } from "./commands/collect-stats.js";
import { createFeatherMetadataCommand, runGenerateFeatherMetadata } from "./commands/generate-feather-metadata.js";
import { createPrepareHotReloadCommand, runPrepareHotReloadCommand } from "./commands/prepare-hot-reload.js";
import { createWatchCommand, runWatchCommand } from "./commands/watch.js";
import { createWatchStatusCommand, runWatchStatusCommand } from "./commands/watch-status.js";
import { isCliRunSkipped, SKIP_CLI_RUN_ENV_VAR } from "./shared/skip-cli-run.js";
import {
    getDefaultIgnoredFileSampleLimit,
    getDefaultSkippedDirectorySampleLimit,
    getDefaultUnsupportedExtensionSampleLimit,
    resolveIgnoredFileSampleLimit,
    resolveSkippedDirectorySampleLimit,
    resolveUnsupportedExtensionSampleLimit
} from "./runtime-options/sample-limits.js";
import { normalizeExtensions } from "./cli-core/extension-normalizer.js";

const {
    compactArray,
    getErrorMessageOrFallback,
    getObjectTagName,
    isErrorLike,
    isErrorWithCode,
    isNonEmptyArray,
    isPathInside,
    mergeUniqueValues,
    toArray,
    toNormalizedLowerCaseSet,
    uniqueArray,
    walkAncestorDirectories,
    withObjectLike
} = Core;

const WRAPPER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolveCliPluginEntryPoint();
const IGNORE_PATH = path.resolve(WRAPPER_DIRECTORY, ".prettierignore");
let initialWorkingDirectory = path.resolve(process.cwd());

const GML_EXTENSION = ".gml";

const ParseErrorAction = Object.freeze({
    REVERT: "revert",
    SKIP: "skip",
    ABORT: "abort"
});

const VALID_PARSE_ERROR_ACTIONS = new Set(Object.values(ParseErrorAction));
const VALID_PRETTIER_LOG_LEVELS = new Set(["debug", "info", "warn", "error", "silent"]);

const parseErrorActionOption = createEnumeratedOptionHelpers(
    VALID_PARSE_ERROR_ACTIONS,
    (list) => `Must be one of: ${list}`
);
const logLevelOption = createEnumeratedOptionHelpers(VALID_PRETTIER_LOG_LEVELS, (list) => `Must be one of: ${list}`);

const FORMAT_COMMAND_CLI_EXAMPLE = "npx prettier-plugin-gml format path/to/project";
const FORMAT_COMMAND_WORKSPACE_EXAMPLE = "npm run format:gml -- path/to/project";
const FORMAT_COMMAND_CHECK_EXAMPLE = `npx prettier-plugin-gml format --check path/to/script${GML_EXTENSION}`;

const PRETTIER_MODULE_ID = process.env.PRETTIER_PLUGIN_GML_PRETTIER_MODULE ?? "prettier";

function formatExtensionListForDisplay(extensions) {
    return extensions.map((extension) => `"${extension}"`).join(", ");
}

function createSampleLimitOption({ flag, description, defaultLimit, parseLimit }) {
    const descriptionText = Array.isArray(description) ? description.join(" ") : description;

    return new Option(flag, descriptionText)
        .argParser(wrapInvalidArgumentResolver(parseLimit))
        .default(defaultLimit, String(defaultLimit));
}

function createConfiguredSampleLimitOption({ flag, description, getDefaultLimit, resolveLimit }) {
    const defaultLimit = getDefaultLimit();
    const parseLimit = (value) =>
        resolveLimit(value, {
            defaultLimit
        });
    const descriptionText = typeof description === "function" ? description(defaultLimit) : description;

    return {
        option: createSampleLimitOption({
            flag,
            description: descriptionText,
            defaultLimit,
            parseLimit
        }),
        parseLimit,
        defaultLimit
    };
}

function createSampleLimitState({ getDefaultLimit, resolveLimit }) {
    let currentValue = getDefaultLimit();

    return {
        getValue: () => currentValue,
        configure(limit) {
            currentValue = resolveLimit(limit);
            return currentValue;
        },
        reset() {
            currentValue = getDefaultLimit();
            return currentValue;
        }
    };
}

function formatPathForDisplay(targetPath) {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedCwd = initialWorkingDirectory;
    const relativePath = path.relative(resolvedCwd, resolvedTarget);

    if (resolvedTarget === resolvedCwd) {
        return ".";
    }

    if (relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
        return relativePath;
    }

    return resolvedTarget;
}

function describeIgnoreSource(ignorePaths) {
    if (!isNonEmptyArray(ignorePaths)) {
        return null;
    }

    const ignorePath = ignorePaths.at(-1);

    if (typeof ignorePath !== "string" || ignorePath.length === 0) {
        return null;
    }

    return formatPathForDisplay(ignorePath);
}

function isMissingPrettierDependency(error) {
    return isMissingModuleDependency(error, "prettier");
}

let prettierModulePromise = null;

function resolvePrettier() {
    if (!prettierModulePromise) {
        prettierModulePromise = import(PRETTIER_MODULE_ID).then(resolveModuleDefaultExport).catch((error) => {
            if (isMissingPrettierDependency(error)) {
                const instructions = [
                    "Prettier v3 must be installed alongside prettier-plugin-gml.",
                    "Install it with:",
                    "  npm install --save-dev prettier@^3"
                ].join("\n");
                const cliError = new CliUsageError(instructions);
                if (isErrorLike(error)) {
                    cliError.cause = error;
                }
                throw cliError;
            }
            throw error;
        });
    }

    return prettierModulePromise;
}

const DEFAULT_EXTENSIONS = resolveDefaultExtensions();

function resolveDefaultExtensions() {
    return normalizeExtensions(process.env.PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS, [GML_EXTENSION]);
}

// Default parse error action: abort formatting on parse errors unless the
// environment override explicitly requests otherwise. Tests and consumers may
// override this behaviour with PRETTIER_PLUGIN_GML_ON_PARSE_ERROR.
const DEFAULT_PARSE_ERROR_ACTION =
    parseErrorActionOption.normalize(process.env.PRETTIER_PLUGIN_GML_ON_PARSE_ERROR, ParseErrorAction.ABORT) ??
    ParseErrorAction.ABORT;

const DEFAULT_PRETTIER_LOG_LEVEL =
    logLevelOption.normalize(process.env.PRETTIER_PLUGIN_GML_LOG_LEVEL, "warn") ?? "warn";

// Save the original console.debug, console.error, console.warn, console.log
// and console.info so we can
// toggle or filter them when the configured Prettier log level requests
// silence. By
// default console.debug is active, which may pollute stdout/stderr during
// repo-wide test runs. The CLI deliberately filters out diagnostic-style
// console.error output (e.g. '[feather:diagnostic]' and '[doc:debug]') when
// the log level is set to 'silent' to keep repo-wide runs deterministic.
const originalConsoleDebug = console.debug;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;

// Lightweight filter used to suppress only the diagnostic lines written by
// internal modules. This avoids fully silencing real error messages while
// preventing noisy diagnostic output that appears on stderr.
function isDiagnosticErrorMessage(message) {
    if (!message || typeof message !== "string") return false;
    return (
        message.startsWith("[feather:diagnostic]") ||
        message.startsWith("[feather:debug]") ||
        message.startsWith("[doc:debug]")
    );
}

// By default, internal modules sometimes write verbose diagnostics to stdout
// via console.log and console.info (e.g. 'promoteLeadingDocCommentTextToDescri
// ption: ...'). When Prettier log level is set to 'silent' we should suppress
// those noisy messages to make repo-wide formatting runs deterministic. We
// specifically filter function-name style debug messages that start with a
// lowercase identifier followed by a colon or known debug phrases.
function isDiagnosticStdoutMessage(message) {
    if (!message || typeof message !== "string") return false;
    // Example: 'promoteLeadingDocCommentTextToDescription: filteredResult pre-promotion'
    if (message.startsWith("promoteLeadingDocCommentTextToDescription:")) {
        return true;
    }
    // FunctionName: pattern (starts with lowercase function name and colon)
    if (/^[a-z][\w.-]*:/.test(message)) {
        return true;
    }
    // Bracketed diagnostic tags (e.g. '[feather:diagnostic]', '[doc:debug]')
    if (
        message.startsWith("[feather:diagnostic]") ||
        message.startsWith("[feather:debug]") ||
        message.startsWith("[doc:debug]")
    ) {
        return true;
    }
    return false;
}

// If the environment explicitly requests the plugin log level to be silent
// at process start, disable console.debug early on so dependencies cannot
// write noisy debug output before the CLI finishes its configuration. This
// mirrors behaviour also applied later by configurePrettierOptions().
if (process.env.PRETTIER_PLUGIN_GML_LOG_LEVEL === "silent") {
    console.debug = () => {};
    console.error = (...args) => {
        // Filter only the diagnostic-style errors; forward everything else.
        if (args.length > 0 && isDiagnosticErrorMessage(String(args[0]))) {
            return;
        }
        return originalConsoleError.apply(console, args);
    };
    console.warn = (...args) => {
        if (args.length > 0 && isDiagnosticErrorMessage(String(args[0]))) {
            return;
        }
        return originalConsoleWarn.apply(console, args as any);
    };
    console.log = (...args) => {
        if (args.length > 0 && isDiagnosticStdoutMessage(String(args[0]))) {
            return;
        }
        return originalConsoleLog.apply(console, args);
    };
    console.info = (...args) => {
        if (args.length > 0 && isDiagnosticStdoutMessage(String(args[0]))) {
            return;
        }
        return originalConsoleInfo.apply(console, args);
    };
}

const FORMAT_ACTION = "format";
const HELP_ACTION = "help";

function resolveDefaultAction() {
    return process.env.PRETTIER_PLUGIN_GML_DEFAULT_ACTION === FORMAT_ACTION ? FORMAT_ACTION : HELP_ACTION;
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

export async function runCliTestCommand({ argv = [], env = {}, cwd }: RunCliTestCommandOptions = {}) {
    const originalEnvValues = new Map<string, string | undefined>();
    const envOverrides = {
        ...env,
        [SKIP_CLI_RUN_ENV_VAR]: "1"
    };

    for (const key of Object.keys(envOverrides)) {
        originalEnvValues.set(key, process.env[key]);
        if (envOverrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = envOverrides[key];
        }
    }

    const originalCwd = process.cwd();
    const originalInitialWorkingDirectory = initialWorkingDirectory;
    const normalizedCwd =
        typeof cwd === "string" ? cwd : typeof cwd?.toString === "function" ? cwd.toString() : undefined;
    if (normalizedCwd) {
        process.chdir(normalizedCwd);
    }
    initialWorkingDirectory = process.cwd();

    const capturedStdout: Array<string> = [];
    const capturedStderr: Array<string> = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    const normalizeWriteChunk = (chunk: string | Uint8Array, encoding?: BufferEncoding) =>
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(encoding);

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
        initialWorkingDirectory = originalInitialWorkingDirectory;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;

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

function createFormatCommand({ name = "prettier-plugin-gml" } = {}) {
    const extensionsOption = new Option(
        "--extensions <list>",
        `File extensions to format (e.g., ${GML_EXTENSION},.yy). Default: ${formatExtensionListForDisplay(DEFAULT_EXTENSIONS)}`
    )
        .argParser((value, previous) => {
            const normalized = normalizeExtensions(value, DEFAULT_EXTENSIONS);

            if (previous === undefined) {
                return normalized;
            }

            const priorValues = Array.isArray(previous) ? previous : compactArray([previous]);

            return mergeUniqueValues(priorValues, normalized);
        })
        .default(undefined, formatExtensionListForDisplay(DEFAULT_EXTENSIONS));

    const { option: skippedDirectorySampleLimitOption, parseLimit: parseSkippedDirectoryLimit } =
        createConfiguredSampleLimitOption({
            flag: "--ignored-directory-sample-limit <count>",
            description: (defaultLimit) =>
                `Max ignored directories shown in summary. Default: ${defaultLimit}, use 0 to hide`,
            getDefaultLimit: getDefaultSkippedDirectorySampleLimit,
            resolveLimit: resolveSkippedDirectorySampleLimit
        });
    const skippedDirectorySamplesAliasOption = new Option(
        "--ignored-directory-samples <count>",
        "Alias for --ignored-directory-sample-limit <count>"
    )
        .argParser(wrapInvalidArgumentResolver(parseSkippedDirectoryLimit))
        .hideHelp();

    const { option: ignoredFileSampleLimitOption } = createConfiguredSampleLimitOption({
        flag: "--ignored-file-sample-limit <count>",
        description: (defaultLimit) => `Max ignored files shown in summary. Default: ${defaultLimit}, use 0 to hide`,
        getDefaultLimit: getDefaultIgnoredFileSampleLimit,
        resolveLimit: resolveIgnoredFileSampleLimit
    });

    const { option: unsupportedExtensionSampleLimitOption } = createConfiguredSampleLimitOption({
        flag: "--unsupported-extension-sample-limit <count>",
        description: (defaultLimit) =>
            `Max unsupported files shown in summary. Default: ${defaultLimit}, use 0 to hide`,
        getDefaultLimit: getDefaultUnsupportedExtensionSampleLimit,
        resolveLimit: resolveUnsupportedExtensionSampleLimit
    });

    return applyStandardCommandOptions(
        new Command()
            .name(name)
            .usage("[options] [path]")
            .description("Format GameMaker Language files using the prettier plugin.")
    )
        .argument("[targetPath]", "Directory or file to format. Defaults to the current working directory.")
        .option("--path <path>", "Directory or file to format (alias for positional argument).")
        .option("--check", "Check formatting without writing changes (dry-run mode)")
        .addOption(extensionsOption)
        .addOption(skippedDirectorySampleLimitOption)
        .addOption(skippedDirectorySamplesAliasOption)
        .addOption(ignoredFileSampleLimitOption)
        .addOption(unsupportedExtensionSampleLimitOption)
        .option(
            "--log-level <level>",
            "Prettier log level: debug|info|warn|error|silent. Default: warn",
            (value) => logLevelOption.requireValue(value, InvalidArgumentError),
            DEFAULT_PRETTIER_LOG_LEVEL
        )
        .option(
            "--on-parse-error <mode>",
            "Parser failure handling: revert|skip|abort. Default: abort",
            (value) => parseErrorActionOption.requireValue(value, InvalidArgumentError),
            DEFAULT_PARSE_ERROR_ACTION
        )
        .addHelpText("after", () =>
            [
                "",
                "Examples:",
                `  ${FORMAT_COMMAND_CLI_EXAMPLE}`,
                `  ${FORMAT_COMMAND_WORKSPACE_EXAMPLE}`,
                `  ${FORMAT_COMMAND_CHECK_EXAMPLE}`,
                ""
            ].join("\n")
        );
}

let targetExtensions = DEFAULT_EXTENSIONS;

/**
 * Create a lookup set for extension comparisons while formatting.
 *
 * @param {readonly string[]} extensions
 * @returns {Set<string>}
 */
function createTargetExtensionSet(extensions) {
    return toNormalizedLowerCaseSet(extensions);
}

let targetExtensionSet = createTargetExtensionSet(targetExtensions);
let placeholderExtension = targetExtensions[0] ?? DEFAULT_EXTENSIONS[0];

/**
 * Apply CLI configuration that influences which files are formatted.
 *
 * @param {readonly string[]} configuredExtensions
 */
function configureTargetExtensionState(configuredExtensions) {
    const fallbackExtensions = resolveDefaultExtensions();
    targetExtensions = configuredExtensions.length > 0 ? configuredExtensions : fallbackExtensions;
    targetExtensionSet = createTargetExtensionSet(targetExtensions);
    placeholderExtension = targetExtensions[0] ?? fallbackExtensions[0];
}

function shouldFormatFile(filePath) {
    const fileExtension = path.extname(filePath).toLowerCase();
    return targetExtensionSet.has(fileExtension);
}

/**
 * Prettier configuration shared by all formatted GameMaker Language files.
 */
const options = {
    parser: "gml-parse",
    plugins: [PLUGIN_PATH],
    logLevel: DEFAULT_PRETTIER_LOG_LEVEL,
    ignorePath: IGNORE_PATH,
    noErrorOnUnmatchedPattern: true
};

function configurePrettierOptions({
    logLevel
}: {
    logLevel?: unknown;
} = {}) {
    const normalized = logLevelOption.normalize(logLevel, DEFAULT_PRETTIER_LOG_LEVEL) ?? DEFAULT_PRETTIER_LOG_LEVEL;
    options.logLevel = normalized;
    // Toggle console.debug and filter console.error based on the configured
    // Prettier log level so internal debug and diagnostic output is suppressed
    // when requested. We filter diagnostic lines to avoid hiding genuine
    // runtime errors while keeping repo-wide runs deterministic in tests.
    if (normalized === "silent") {
        console.debug = () => {};
        console.error = (...args) => {
            if (args.length > 0 && isDiagnosticErrorMessage(String(args[0]))) {
                return;
            }
            return originalConsoleError.apply(console, args);
        };
        console.warn = (...args) => {
            if (args.length > 0 && isDiagnosticErrorMessage(String(args[0]))) {
                return;
            }
            return originalConsoleWarn.apply(console, args as any);
        };
        console.log = (...args) => {
            if (args.length > 0 && isDiagnosticStdoutMessage(String(args[0]))) {
                return;
            }
            return originalConsoleLog.apply(console, args);
        };
        console.info = (...args) => {
            if (args.length > 0 && isDiagnosticStdoutMessage(String(args[0]))) {
                return;
            }
            return originalConsoleInfo.apply(console, args);
        };
    } else {
        console.debug = originalConsoleDebug;
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
    }
}

const skippedFileSummary = {
    ignored: 0,
    ignoredSamples: [],
    unsupportedExtension: 0,
    unsupportedExtensionSamples: [],
    symbolicLink: 0
};

const skippedDirectorySummary = {
    ignored: 0,
    ignoredSamples: []
};

let checkModeEnabled = false;
let pendingFormatCount = 0;
let formattedFileCount = 0;

function resetCheckModeTracking() {
    pendingFormatCount = 0;
}

function resetFormattedFileTracking() {
    formattedFileCount = 0;
}

function configureCheckMode(enabled) {
    checkModeEnabled = Boolean(enabled);
    resetCheckModeTracking();
}

const skippedDirectorySampleLimitState = createSampleLimitState({
    getDefaultLimit: getDefaultSkippedDirectorySampleLimit,
    resolveLimit: resolveSkippedDirectorySampleLimit
});

function configureSkippedDirectorySampleLimit(limit) {
    skippedDirectorySampleLimitState.configure(limit);
}

function getSkippedDirectorySampleLimit() {
    return skippedDirectorySampleLimitState.getValue();
}

const ignoredFileSampleLimitState = createSampleLimitState({
    getDefaultLimit: getDefaultIgnoredFileSampleLimit,
    resolveLimit: resolveIgnoredFileSampleLimit
});

function configureIgnoredFileSampleLimit(limit) {
    ignoredFileSampleLimitState.configure(limit);
}

function getIgnoredFileSampleLimit() {
    return ignoredFileSampleLimitState.getValue();
}

const unsupportedExtensionSampleLimitState = createSampleLimitState({
    getDefaultLimit: getDefaultUnsupportedExtensionSampleLimit,
    resolveLimit: resolveUnsupportedExtensionSampleLimit
});

function configureUnsupportedExtensionSampleLimit(limit) {
    unsupportedExtensionSampleLimitState.configure(limit);
}

function getUnsupportedExtensionSampleLimit() {
    return unsupportedExtensionSampleLimitState.getValue();
}

function resetSkippedFileSummary() {
    skippedFileSummary.ignored = 0;
    skippedFileSummary.ignoredSamples.length = 0;
    skippedFileSummary.unsupportedExtension = 0;
    skippedFileSummary.unsupportedExtensionSamples.length = 0;
    skippedFileSummary.symbolicLink = 0;
}

function resetSkippedDirectorySummary() {
    skippedDirectorySummary.ignored = 0;
    skippedDirectorySummary.ignoredSamples.length = 0;
}

function recordSkippedDirectory(directory) {
    skippedDirectorySummary.ignored += 1;
    const limit = getSkippedDirectorySampleLimit();
    tryAddSample(skippedDirectorySummary.ignoredSamples, directory, limit);
}
let baseProjectIgnorePaths = [];
const baseProjectIgnorePathSet = new Set();
let encounteredFormattingError = false;
let formattingErrorCount = 0;
const NEGATED_IGNORE_RULE_PATTERN = /^\s*!.*\S/m;
let parseErrorAction = DEFAULT_PARSE_ERROR_ACTION;
let abortRequested = false;
let revertTriggered = false;
const formattedFileOriginalContents = new Map();
let revertSnapshotDirectoryPromise = null;
let revertSnapshotDirectory = null;
let revertSnapshotFileCount = 0;
let encounteredFormattableFile = false;

function ensureRevertSnapshotDirectory() {
    if (revertSnapshotDirectory) {
        return revertSnapshotDirectory;
    }

    if (!revertSnapshotDirectoryPromise) {
        const prefix = path.join(os.tmpdir(), "prettier-plugin-gml-revert-");
        revertSnapshotDirectoryPromise = mkdtemp(prefix).then(
            (directory) => {
                revertSnapshotDirectory = directory;
                return directory;
            },
            (error) => {
                revertSnapshotDirectoryPromise = null;
                throw error;
            }
        );
    }

    return revertSnapshotDirectoryPromise;
}

async function cleanupRevertSnapshotDirectory() {
    const directory = revertSnapshotDirectory;
    revertSnapshotDirectory = null;
    revertSnapshotDirectoryPromise = null;

    if (!directory) {
        return;
    }

    try {
        await rm(directory, { recursive: true, force: true });
    } catch {
        // Treat teardown of the revert workspace as best-effort. The directory
        // lives under `os.tmpdir()` and only exists when callers opt into the
        // `--on-parse-error=revert` safety net described in
        // README.md#format-from-a-local-clone. Surfacing an ENOENT/EACCES
        // failure here would mask the original parser crash and leave users
        // questioning whether their edits were restored. Leaving the directory
        // behind is harmless because the OS eventually sweeps the temp folder,
        // whereas interrupting the CLI would undermine the recovery guarantee.
    }
}

async function releaseSnapshot(snapshot) {
    await withObjectLike(
        snapshot,
        async (snapshotObject) => {
            const { snapshotPath } = snapshotObject;
            if (!snapshotPath) {
                return;
            }

            try {
                await rm(snapshotPath, { force: true });
            } catch {
                // Suppress cleanup errors to ensure the original error is not masked.
                // When a snapshot revert fails (e.g., temporary directory cleanup
                // after a formatting error), we catch and ignore the failure rather
                // than propagating it. The revert is a best-effort rollback triggered
                // by an earlier error (parsing failure, write error, etc.), and
                // throwing a new error here would hide the root cause in the output.
                // By ignoring cleanup failures, we allow the original error to surface
                // in diagnostics, making it easier for users to identify and fix the
                // underlying issue. The temporary files may remain on disk, but this
                // is preferable to obscuring the real problem.
            } finally {
                if (revertSnapshotFileCount > 0) {
                    revertSnapshotFileCount -= 1;
                }
            }
        },
        () => {}
    );
}

async function discardFormattedFileOriginalContents() {
    const snapshots = [...formattedFileOriginalContents.values()];
    formattedFileOriginalContents.clear();

    for (const snapshot of snapshots) {
        // Release each snapshot in sequence so the shared
        // `revertSnapshotFileCount` accounting stays in sync with the
        // filesystem. `releaseSnapshot` also decides whether the directory can
        // be torn down or has to stick around for inline fallbacks, so keeping
        // this loop serial avoids racy cleanups that might drop still-needed
        // backups when the process is under heavy I/O pressure.
        await releaseSnapshot(snapshot);
    }

    if (revertSnapshotFileCount === 0) {
        await cleanupRevertSnapshotDirectory();
    }
}

async function readSnapshotContents(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return "";
    }

    const { inlineContents, snapshotPath } = snapshot;

    if (inlineContents !== null) {
        return inlineContents;
    }

    if (!snapshotPath) {
        return "";
    }

    try {
        return await readFile(snapshotPath, "utf8");
    } catch {
        return null;
    }
}

/**
 * Reset run-specific state between CLI invocations.
 *
 * @param {string} onParseError
 */
async function resetFormattingSession(onParseError) {
    parseErrorAction = onParseError;
    abortRequested = false;
    revertTriggered = false;
    await discardFormattedFileOriginalContents();
    resetSkippedFileSummary();
    resetSkippedDirectorySummary();
    encounteredFormattingError = false;
    formattingErrorCount = 0;
    resetRegisteredIgnorePaths();
    ignoreRuleNegations.detected = false;
    encounteredFormattableFile = false;
    resetCheckModeTracking();
    resetFormattedFileTracking();
}

/**
 * Persist ignore path information for use throughout the run.
 *
 * @param {readonly string[]} ignorePaths
 */
function setBaseProjectIgnorePaths(ignorePaths) {
    baseProjectIgnorePaths = ignorePaths;
    baseProjectIgnorePathSet.clear();

    for (const projectIgnorePath of ignorePaths) {
        baseProjectIgnorePathSet.add(projectIgnorePath);
    }
}

async function recordFormattedFileOriginalContents(filePath, contents) {
    if (parseErrorAction !== ParseErrorAction.REVERT) {
        return;
    }

    if (formattedFileOriginalContents.has(filePath)) {
        return;
    }

    const snapshot = {
        snapshotPath: null,
        inlineContents: null
    };

    try {
        const directory = await ensureRevertSnapshotDirectory();
        const extension = path.extname(filePath) || ".snapshot";
        const snapshotName = `${randomUUID()}${extension}`;
        const snapshotPath = path.join(directory, snapshotName);
        await writeFile(snapshotPath, contents, "utf8");
        snapshot.snapshotPath = snapshotPath;
        revertSnapshotFileCount += 1;
    } catch {
        // Store the snapshot contents in memory when the temporary directory is
        // unavailable or write access fails. This fallback ensures revert operations
        // can still proceed even if disk I/O fails, though it consumes more memory
        // and won't survive process crashes.
        snapshot.inlineContents = contents;
    }

    formattedFileOriginalContents.set(filePath, snapshot);
}

async function revertFormattedFiles() {
    if (formattedFileOriginalContents.size === 0) {
        return;
    }

    const revertEntries = [...formattedFileOriginalContents.entries()];
    formattedFileOriginalContents.clear();

    console.warn(
        `Reverting ${revertEntries.length} formatted ${
            revertEntries.length === 1 ? "file" : "files"
        } due to parser failure.`
    );

    for (const [filePath, snapshot] of revertEntries) {
        try {
            const originalContents = await readSnapshotContents(snapshot);
            if (originalContents == null) {
                throw new Error("Revert snapshot is unavailable");
            }
            await writeFile(filePath, originalContents);
            console.warn(`Reverted ${filePath}`);
        } catch (revertError) {
            logCliErrorWithHeader(revertError, `Failed to revert ${filePath}`);
        } finally {
            // Always release the snapshot so the shared revert bookkeeping can
            // decide whether the temporary directory is still needed. Skipping
            // this step after a failed write would leak backups, block future
            // revert attempts from creating fresh snapshots, and leave the
            // `revertSnapshotFileCount` counter desynchronized from reality.
            await releaseSnapshot(snapshot);
        }
    }

    if (revertSnapshotFileCount === 0) {
        await cleanupRevertSnapshotDirectory();
    }
}

function logCliErrorWithHeader(error, header) {
    const formattedError = formatCliError(error);

    if (!formattedError) {
        console.error(header);
        return;
    }

    const indented = formattedError
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");

    console.error(`${header}\n${indented}`);
}

async function handleFormattingError(error, filePath) {
    // Decide whether the error should count as a formatting failure.
    // Treat parser syntax errors as non-fatal when configured to SKIP so
    // repo-wide formatting runs (e.g., in CI/test) don't fail due to
    // intentionally malformed fixtures.
    const isParseError = !!(
        error &&
        (error.name === "GameMakerSyntaxError" || (error instanceof Error && error.name === "GameMakerSyntaxError"))
    );

    // When the user specifies `--parse-error-action=SKIP`, they're explicitly opting
    // into a workflow where parse errors are treated as non-fatal: the CLI should
    // quietly skip files with syntax issues rather than halting or printing error
    // diagnostics. Incrementing `formattingErrorCount` or emitting stderr messages
    // would violate that contract and confuse users who expect a clean, silent run
    // when malformed files are present. This guard ensures that SKIP mode suppresses
    // both the failure counter and the user-facing error output, preserving backward
    // compatibility with test suites that rely on quiet runs when parse errors are
    // expected. Other modes (REVERT and ABORT) preserve the original behavior of
    // logging errors and updating counters, since they signal that parse failures
    // should be treated as actionable problems rather than ignorable noise.
    const header = `Failed to format ${filePath}`;
    if (parseErrorAction === ParseErrorAction.SKIP && isParseError) {
        // Suppress parse-error counting and stderr logging when SKIP mode is active.
        // Tests expect quiet runs in this configuration, and incrementing failure
        // counters would incorrectly signal formatting issues for files we deliberately
        // ignored. Return early without updating `encounteredFormattingError` or
        // `formattingErrorCount` so the CLI exit code reflects only genuine failures.
        return;
    }

    encounteredFormattingError = true;
    formattingErrorCount += 1;
    logCliErrorWithHeader(error, header);

    if (parseErrorAction === ParseErrorAction.REVERT) {
        if (revertTriggered) {
            return;
        }

        revertTriggered = true;
        abortRequested = true;
        await revertFormattedFiles();
        return;
    }

    if (parseErrorAction === ParseErrorAction.ABORT) {
        abortRequested = true;
    }
}

async function detectNegatedIgnoreRules(ignoreFilePath) {
    try {
        const contents = await readFile(ignoreFilePath, "utf8");

        if (NEGATED_IGNORE_RULE_PATTERN.test(contents)) {
            ignoreRuleNegations.detected = true;
        }
    } catch {
        // Tolerate missing or inaccessible ignore files during negation detection.
        // The ignore-file scanning process attempts to detect negated rules
        // (e.g., `!foo.gml`) across all referenced ignore files. If a file is
        // missing, unreadable, or has restrictive permissions, we catch the error
        // and continue without crashing the formatter. The defensive posture here
        // ensures that the formatter remains operational even when the ignore-file
        // infrastructure is incomplete or misconfigured. Missing negation detection
        // for one file is acceptable—the formatter falls back to its default
        // ignore behavior, which is safer than aborting the entire run.
    }
}

/**
 * Register a single ignore file and capture negated rule metadata when needed.
 *
 * Centralizing the per-file bookkeeping keeps the bulk registration flow
 * focused on coordinating the overall workflow.
 */
async function registerIgnoreFile(ignoreFilePath) {
    if (!ignoreFilePath || hasRegisteredIgnorePath(ignoreFilePath)) {
        return;
    }

    registerIgnorePath(ignoreFilePath);

    if (ignoreRuleNegations.detected) {
        return;
    }

    await detectNegatedIgnoreRules(ignoreFilePath);
}

async function registerIgnorePaths(ignoreFiles) {
    for (const ignoreFilePath of ignoreFiles) {
        await registerIgnoreFile(ignoreFilePath);
    }
}

function getIgnorePathOptions(additionalIgnorePaths = []) {
    const ignoreCandidates = compactArray([IGNORE_PATH, ...baseProjectIgnorePaths, ...additionalIgnorePaths]);
    if (ignoreCandidates.length === 0) {
        return null;
    }

    const uniqueIgnorePaths = uniqueArray(ignoreCandidates);
    return uniqueIgnorePaths.length === 1 ? uniqueIgnorePaths[0] : uniqueIgnorePaths;
}

async function shouldSkipDirectory(directory, activeIgnorePaths = []) {
    if (ignoreRuleNegations.detected) {
        return false;
    }

    const ignorePathOption = getIgnorePathOptions(activeIgnorePaths);
    if (!ignorePathOption) {
        return false;
    }

    const placeholderPath = path.join(directory, `__prettier_plugin_gml_ignore_test__${placeholderExtension}`);

    const prettier = await resolvePrettier();

    try {
        const fileInfo = await prettier.getFileInfo(placeholderPath, {
            ignorePath: ignorePathOption,
            plugins: options.plugins,
            resolveConfig: true
        });

        if (fileInfo.ignored) {
            recordSkippedDirectory(directory);
            return true;
        }
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        console.warn(`Unable to evaluate ignore rules for ${directory}: ${message}`);
    }

    return false;
}

/**
 * Resolve the directory bounds that should be inspected for ignore files.
 *
 * @param {string} directory
 */
function resolveIgnoreSearchBounds(directory) {
    const resolvedDirectory = path.resolve(directory);
    const resolvedWorkingDirectory = initialWorkingDirectory;
    const shouldLimitToWorkingDirectory = isPathInside(resolvedDirectory, resolvedWorkingDirectory);

    return {
        resolvedDirectory,
        searchRoot: shouldLimitToWorkingDirectory ? resolvedWorkingDirectory : null
    };
}

/**
 * Create the list of ignore file candidates from directories.
 *
 * @param {readonly string[]} directories
 */
function collectIgnoreCandidatePaths(directories) {
    return directories.map((candidateDirectory) => path.join(candidateDirectory, ".prettierignore"));
}

function collectIgnoreSearchDirectories(directory, searchRoot) {
    const resolvedDirectory = path.resolve(directory);
    const resolvedSearchRoot = searchRoot ? path.resolve(searchRoot) : null;

    const directories = [];
    for (const candidate of walkAncestorDirectories(resolvedDirectory)) {
        directories.push(candidate);

        if (resolvedSearchRoot && candidate === resolvedSearchRoot) {
            break;
        }
    }

    return directories;
}

/**
 * Filter the provided paths down to the ignore files that exist.
 *
 * @param {readonly string[]} candidatePaths
 */
async function collectExistingIgnoreFiles(candidatePaths) {
    const discovered = await Promise.all(
        candidatePaths.map(async (ignoreCandidate) => {
            try {
                const stats = await stat(ignoreCandidate);
                return stats.isFile() ? ignoreCandidate : null;
            } catch {
                // Tolerate missing or unreadable ignore files during discovery.
                // The formatter scans a standard set of ignore-file candidates
                // (e.g., .prettierignore, .gitignore) without requiring all of them
                // to exist. Projects may provide only a subset of these files, and
                // attempting to stat a missing file throws ENOENT. By catching and
                // suppressing these errors, we register only the files that are
                // present and readable, keeping the collection logic simple and
                // resilient. Failures to read files that do exist (e.g., permission
                // errors) are also silently ignored here, which is acceptable because
                // the formatter falls back to default ignore rules when custom files
                // are unavailable.
                return null;
            }
        })
    );

    return compactArray(discovered);
}

async function resolveProjectIgnorePaths(directory) {
    const { resolvedDirectory, searchRoot } = resolveIgnoreSearchBounds(directory);
    const directoriesToInspect = collectIgnoreSearchDirectories(resolvedDirectory, searchRoot);
    const candidatePaths = collectIgnoreCandidatePaths(directoriesToInspect);
    return collectExistingIgnoreFiles(candidatePaths);
}

/**
 * Discover ignore files for a project and register them with Prettier.
 *
 * @param {string} projectRoot
 */
async function initializeProjectIgnorePaths(projectRoot) {
    const projectIgnorePaths = await resolveProjectIgnorePaths(projectRoot);
    setBaseProjectIgnorePaths(projectIgnorePaths);
    await registerIgnorePaths([IGNORE_PATH, ...projectIgnorePaths]);
}

/**
 * Detects if a path looks like a mistyped command name rather than a file path.
 * Returns true if the input is a simple word (no path separators) that might be
 * a command name the user meant to invoke.
 *
 * @param {string} target - The target path to check (should be the original input, not resolved)
 * @returns {boolean}
 */
function looksLikeCommandName(target: string): boolean {
    const KNOWN_COMMANDS = new Set([
        "format",
        "performance",
        "memory",
        "generate-gml-identifiers",
        "generate-quality-report",
        "collect-stats",
        "generate-feather-metadata",
        "prepare-hot-reload",
        "watch",
        "watch-status",
        "help"
    ]);

    // Thresholds for similarity detection
    const MAX_LENGTH_DIFFERENCE = 2;
    const MAX_CHARACTER_DIFFERENCES = 2;

    // Not a command if it contains path separators
    if (target.includes("/") || target.includes("\\")) {
        return false;
    }

    // Not a command if it looks like a file (has an extension)
    if (/\.\w+$/.test(target)) {
        return false;
    }

    // Exact match with known command
    if (KNOWN_COMMANDS.has(target)) {
        return true;
    }

    // Starts with a letter and contains only alphanumeric, hyphens, or underscores
    // (typical command pattern)
    if (/^[a-z][a-z0-9_-]*$/i.test(target)) {
        // Check for common typos or similar command names using simple similarity heuristic
        const lowerTarget = target.toLowerCase();
        for (const command of KNOWN_COMMANDS) {
            // Quick length check first (early termination optimization)
            if (Math.abs(command.length - lowerTarget.length) > MAX_LENGTH_DIFFERENCE) {
                continue;
            }

            // Count character differences at matching positions
            let differences = 0;
            const minLength = Math.min(command.length, lowerTarget.length);
            for (let i = 0; i < minLength; i++) {
                if (command[i] !== lowerTarget[i]) {
                    differences++;
                    // Early termination if too many differences
                    if (differences > MAX_CHARACTER_DIFFERENCES) {
                        break;
                    }
                }
            }

            // If 2 or fewer character differences and not more than half the string differs
            if (differences <= MAX_CHARACTER_DIFFERENCES && differences < command.length / 2) {
                return true;
            }
        }
    }

    return false;
}

async function resolveTargetStats(
    target: string,
    { usage, originalInput }: { usage?: string; originalInput?: string } = {}
) {
    try {
        return await stat(target);
    } catch (error) {
        const details = getErrorMessageOrFallback(error);
        const formattedTarget = formatPathForDisplay(target);
        const guidance = (() => {
            if (isErrorWithCode(error, "ENOENT")) {
                // Check if the original input (before path resolution) looks like a command name
                const inputToCheck = originalInput ?? target;
                if (looksLikeCommandName(inputToCheck)) {
                    const guidanceParts = [
                        `Did you mean to run a command? If so, the command '${inputToCheck}' is not recognized.`,
                        'Run "prettier-plugin-gml --help" to see available commands.',
                        "If you intended to format a file or directory, verify the path exists relative",
                        `to the current working directory (${initialWorkingDirectory}) or provide an absolute path.`
                    ];
                    return guidanceParts.join(" ");
                }

                const guidanceParts = [
                    "Verify the path exists relative to the current working directory",
                    `(${initialWorkingDirectory}) or provide an absolute path.`,
                    'Run "prettier-plugin-gml --help" to review available commands and usage examples.'
                ];

                return guidanceParts.join(" ");
            }

            if (isErrorWithCode(error, "EACCES")) {
                return "Check that you have permission to read the path.";
            }

            return null;
        })();
        const messageParts = [`Unable to access ${formattedTarget}: ${details}.`];

        if (guidance) {
            messageParts.push(guidance);
        }

        throw new CliUsageError(messageParts.join(" "), { usage });
    }
}

async function resolveDirectoryIgnoreContext(directory, inheritedIgnorePaths) {
    const localIgnorePath = path.join(directory, ".prettierignore");
    let effectiveIgnorePaths = inheritedIgnorePaths;
    let shouldRegisterLocalIgnore = baseProjectIgnorePathSet.has(localIgnorePath);

    try {
        const ignoreStats = await stat(localIgnorePath);

        if (ignoreStats.isFile()) {
            shouldRegisterLocalIgnore = true;

            effectiveIgnorePaths = mergeUniqueValues(inheritedIgnorePaths, [localIgnorePath], { freeze: false });
        }
    } catch {
        // Tolerate missing local ignore files and inherit parent directory rules.
        // When a subdirectory lacks its own .prettierignore file, we catch the
        // stat error and proceed with the inherited ignore paths from parent
        // directories. This resilience allows projects to layer ignore rules
        // hierarchically (e.g., a repo-wide .prettierignore at the root with
        // subdirectory overrides) without requiring every directory to have its
        // own ignore file. Missing files are normal and expected in this workflow,
        // so we suppress the error rather than propagating it and breaking the
        // formatting run.
    }

    return {
        effectiveIgnorePaths,
        localIgnorePath,
        shouldRegisterLocalIgnore
    };
}

async function processDirectoryEntry(filePath, currentIgnorePaths) {
    const stats = await lstat(filePath);

    if (stats.isSymbolicLink()) {
        console.log(`Skipping ${filePath} (symbolic link)`);
        skippedFileSummary.symbolicLink += 1;
        return;
    }

    if (stats.isDirectory()) {
        if (await shouldSkipDirectory(filePath, currentIgnorePaths)) {
            return;
        }
        await processDirectory(filePath, currentIgnorePaths);
        return;
    }

    if (shouldFormatFile(filePath)) {
        await processFile(filePath, currentIgnorePaths);
        return;
    }

    recordUnsupportedExtension(filePath);
}

async function processDirectoryEntries(directory, files, currentIgnorePaths) {
    for (const file of files) {
        if (abortRequested) {
            return;
        }

        const filePath = path.join(directory, file);
        await processDirectoryEntry(filePath, currentIgnorePaths);

        if (abortRequested) {
            return;
        }
    }
}

async function processDirectory(directory, inheritedIgnorePaths = []) {
    if (abortRequested) {
        return;
    }

    const { effectiveIgnorePaths, localIgnorePath, shouldRegisterLocalIgnore } = await resolveDirectoryIgnoreContext(
        directory,
        inheritedIgnorePaths
    );

    if (shouldRegisterLocalIgnore) {
        await registerIgnorePaths([localIgnorePath]);
    }

    const files = await readdir(directory);
    await processDirectoryEntries(directory, files, effectiveIgnorePaths);
}

async function resolveFormattingOptions(filePath) {
    const prettier = await resolvePrettier();
    let resolvedConfig = null;

    try {
        resolvedConfig = await prettier.resolveConfig(filePath, {
            editorconfig: true
        });
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        console.warn(`Unable to resolve Prettier config for ${filePath}: ${message}`);
    }

    const mergedOptions = {
        ...options,
        ...resolvedConfig,
        filepath: filePath
    };

    const basePlugins = toArray(options.plugins);
    const resolvedPlugins = toArray(resolvedConfig?.plugins);
    const combinedPlugins = uniqueArray([...basePlugins, ...resolvedPlugins]);

    if (combinedPlugins.length > 0) {
        mergedOptions.plugins = combinedPlugins;
    }

    mergedOptions.parser = options.parser;

    return mergedOptions;
}

async function processFile(filePath, activeIgnorePaths = []) {
    if (abortRequested) {
        return;
    }
    try {
        const formattingOptions = await resolveFormattingOptions(filePath);
        const prettier = await resolvePrettier();
        const ignorePathOption = getIgnorePathOptions(activeIgnorePaths);
        const fileInfo = await prettier.getFileInfo(filePath, {
            ...(ignorePathOption ? { ignorePath: ignorePathOption } : {}),
            plugins: formattingOptions.plugins,
            resolveConfig: true
        });

        if (fileInfo.ignored) {
            const ignoreSourceDescription = describeIgnoreSource(activeIgnorePaths);
            const formattedIgnoreSource = ignoreSourceDescription ? `ignored by ${ignoreSourceDescription}` : "ignored";

            recordIgnoredFile({
                filePath,
                sourceDescription: formattedIgnoreSource
            });
            return;
        }

        encounteredFormattableFile = true;

        const data = await readFile(filePath, "utf8");
        const formatted = await prettier.format(data, formattingOptions);

        if (formatted === data) {
            return;
        }

        if (checkModeEnabled) {
            pendingFormatCount += 1;
            console.log(`Would format ${formatPathForDisplay(filePath)}`);
            return;
        }

        await recordFormattedFileOriginalContents(filePath, data);
        await writeFile(filePath, formatted);
        formattedFileCount += 1;
        console.log(`Formatted ${filePath}`);
    } catch (error) {
        await handleFormattingError(error, filePath);
    }
}

/**
 * Validate command input to ensure the caller supplied a usable target path.
 *
 * @param {{ targetPathProvided: boolean, targetPathInput: unknown, usage: string }} params
 */
function describeTargetPathInput(value) {
    if (value === null) {
        return "null";
    }

    if (value === undefined) {
        return "undefined";
    }

    if (typeof value === "string") {
        return value.length === 0 ? "an empty string" : `string '${value}'`;
    }

    if (typeof value === "number" || typeof value === "bigint") {
        return `${typeof value} ${String(value)}`;
    }

    if (typeof value === "boolean") {
        return `boolean ${value}`;
    }

    if (typeof value === "symbol") {
        return "a symbol";
    }

    if (typeof value === "function") {
        return value.name ? `function ${value.name}` : "a function";
    }

    const tagName = getObjectTagName(value);
    if (tagName === "Array") {
        return "an array";
    }

    if (tagName === "Object" || !tagName) {
        return "a plain object";
    }

    const article = /^[aeiou]/i.test(tagName) ? "an" : "a";
    return `${article} ${tagName} object`;
}

function validateTargetPathInput({ targetPathProvided, targetPathInput, usage }) {
    if (!targetPathProvided) {
        return;
    }

    if (targetPathInput == null || targetPathInput === "") {
        throw new CliUsageError(
            [
                "Target path cannot be empty. Pass a directory or file to format (relative or absolute) or omit --path to format the current working directory.",
                "If the path conflicts with a command name, invoke the format subcommand explicitly (prettier-plugin-gml format <path>)."
            ].join(" "),
            { usage }
        );
    }

    if (typeof targetPathInput !== "string") {
        const description = describeTargetPathInput(targetPathInput);
        throw new CliUsageError(`Target path must be provided as a string. Received ${description}.`, { usage });
    }
}

/**
 * Resolve the file system path that should be formatted.
 *
 * @param {unknown} targetPathInput
 * @param {string} [options.rawTargetPathInput]
 * @returns {string}
 */
function resolveTargetPathFromInput(targetPathInput, { rawTargetPathInput }: { rawTargetPathInput?: string } = {}) {
    const hasExplicitTarget = Core.isNonEmptyString(targetPathInput);
    const normalizedTarget = hasExplicitTarget ? targetPathInput : ".";
    const resolvedNormalizedTarget = path.resolve(process.cwd(), normalizedTarget);

    if (hasExplicitTarget && typeof rawTargetPathInput === "string") {
        const resolvedRawTarget = path.resolve(process.cwd(), rawTargetPathInput);

        if (resolvedRawTarget !== resolvedNormalizedTarget) {
            if (safeExistsSync(resolvedRawTarget)) {
                return resolvedRawTarget;
            }

            if (safeExistsSync(resolvedNormalizedTarget)) {
                return resolvedNormalizedTarget;
            }
        }
    }

    return resolvedNormalizedTarget;
}

function safeExistsSync(candidatePath) {
    try {
        return existsSync(candidatePath);
    } catch {
        return false;
    }
}

/**
 * Configure global state for a formatting run based on CLI flags.
 *
 * @param {{
 *   configuredExtensions: readonly string[],
 *   prettierLogLevel: string,
 *   onParseError: string,
 *   skippedDirectorySampleLimit: number,
 *   ignoredFileSampleLimit: number,
 *   unsupportedExtensionSampleLimit: number
 * }} params
 */
async function prepareFormattingRun({
    configuredExtensions,
    prettierLogLevel,
    onParseError,
    skippedDirectorySampleLimit,
    ignoredFileSampleLimit,
    unsupportedExtensionSampleLimit,
    checkMode
}) {
    configurePrettierOptions({ logLevel: prettierLogLevel });
    configureTargetExtensionState(configuredExtensions);
    configureSkippedDirectorySampleLimit(skippedDirectorySampleLimit);
    configureIgnoredFileSampleLimit(ignoredFileSampleLimit);
    configureUnsupportedExtensionSampleLimit(unsupportedExtensionSampleLimit);
    const normalizedParseErrorAction = parseErrorActionOption.requireValue(onParseError);
    await resetFormattingSession(normalizedParseErrorAction);
    configureCheckMode(checkMode);
}

/**
 * Resolve metadata about the requested target and ensure it can be formatted.
 *
 * @param {string} targetPath
 * @param {string} usage
 * @param {string} [originalInput] - The original user input before path resolution
 * @returns {Promise<{ targetIsDirectory: boolean, projectRoot: string }>}
 */
async function resolveTargetContext(targetPath, usage, originalInput) {
    const targetStats = await resolveTargetStats(targetPath, { usage, originalInput });
    const targetIsDirectory = targetStats.isDirectory();

    if (!targetIsDirectory && !targetStats.isFile()) {
        throw new CliUsageError(`${targetPath} is not a file or directory that can be formatted`, { usage });
    }

    const projectRoot = targetIsDirectory ? targetPath : path.dirname(targetPath);

    return { targetIsDirectory, projectRoot };
}

/**
 * Process a single-file target when the CLI input does not resolve to a directory.
 *
 * @param {string} targetPath
 */
async function processNonDirectoryTarget(targetPath) {
    if (shouldFormatFile(targetPath)) {
        await processFile(targetPath, baseProjectIgnorePaths);
        return;
    }

    recordUnsupportedExtension(targetPath);
}

/**
 * Execute formatting for the resolved target after validation.
 *
 * @param {{ targetPath: string, targetIsDirectory: boolean, projectRoot: string }} params
 */
async function processResolvedTarget({ targetPath, targetIsDirectory, projectRoot }) {
    await initializeProjectIgnorePaths(projectRoot);

    if (targetIsDirectory) {
        await processDirectory(targetPath);
        return;
    }

    await processNonDirectoryTarget(targetPath);
}

/**
 * Emit summary information about a formatting run.
 *
 * @param {{ targetPath: string, targetIsDirectory: boolean }} params
 */
function finalizeFormattingRun({ targetPath, targetIsDirectory, targetPathProvided }) {
    if (encounteredFormattableFile) {
        if (checkModeEnabled) {
            logCheckModeSummary();
        } else {
            logWriteModeSummary({
                targetPath,
                targetIsDirectory,
                targetPathProvided
            });
        }
        logSkippedFileSummary();
    } else {
        logNoMatchingFiles({
            targetPath,
            targetIsDirectory,
            targetPathProvided,
            extensions: targetExtensions
        });
    }

    if (checkModeEnabled && pendingFormatCount > 0) {
        process.exitCode = 1;
    }
    if (encounteredFormattingError) {
        logFormattingErrorSummary();
        process.exitCode = 1;
    }
}

/**
 * Fully execute the formatting workflow for a validated target path.
 *
 * @param {{ targetPath: string, usage: string, originalInput?: string }} params
 */
async function runFormattingWorkflow({ targetPath, usage, targetPathProvided, originalInput }) {
    const { targetIsDirectory, projectRoot } = await resolveTargetContext(targetPath, usage, originalInput);

    await processResolvedTarget({
        targetPath,
        targetIsDirectory,
        projectRoot
    });

    finalizeFormattingRun({
        targetPath,
        targetIsDirectory,
        targetPathProvided
    });
}

async function executeFormatCommand(command) {
    const commandOptions = collectFormatCommandOptions(command, {
        defaultExtensions: resolveDefaultExtensions(),
        defaultParseErrorAction: DEFAULT_PARSE_ERROR_ACTION,
        defaultPrettierLogLevel: DEFAULT_PRETTIER_LOG_LEVEL
    });
    const {
        usage,
        targetPathInput,
        targetPathProvided,
        rawTargetPathInput,
        skippedDirectorySampleLimit,
        ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit
    } = commandOptions;

    validateTargetPathInput(commandOptions);

    const targetPath = resolveTargetPathFromInput(targetPathInput, {
        rawTargetPathInput
    });

    // Keep the original input (before path resolution) for better error messages
    const originalInput = typeof targetPathInput === "string" ? targetPathInput : undefined;

    await prepareFormattingRun({
        configuredExtensions: commandOptions.extensions,
        prettierLogLevel: commandOptions.prettierLogLevel,
        onParseError: commandOptions.onParseError,
        skippedDirectorySampleLimit,
        ignoredFileSampleLimit,
        unsupportedExtensionSampleLimit,
        checkMode: commandOptions.checkMode
    });

    try {
        await runFormattingWorkflow({
            targetPath,
            usage,
            targetPathProvided,
            originalInput
        });
    } finally {
        await discardFormattedFileOriginalContents();
    }
}

function logNoMatchingFiles({ targetPath, targetIsDirectory, targetPathProvided, extensions }) {
    const formattedExtensions = formatExtensionListForDisplay(extensions);
    const formattedTarget = formatPathForDisplay(targetPath);
    const locationDescription = targetIsDirectory
        ? describeDirectoryWithoutMatches({
              formattedTargetPath: formattedTarget,
              targetPathProvided
          })
        : formattedTarget;
    const exampleGuidance = `For example: ${FORMAT_COMMAND_CLI_EXAMPLE} or ${FORMAT_COMMAND_WORKSPACE_EXAMPLE}.`;
    const guidance = targetIsDirectory
        ? [
              "Provide a directory or file containing GameMaker Language sources.",
              exampleGuidance,
              "Adjust --extensions or update your .prettierignore files if this is unexpected."
          ].join(" ")
        : [
              "Pass --extensions to include this file or adjust your .prettierignore files if this is unexpected.",
              exampleGuidance
          ].join(" ");
    const ignoredFilesSkipped = skippedFileSummary.ignored > 0;
    const ignoredMessageSuffix = "Adjust your .prettierignore files or refine the target path if this is unexpected.";

    if (targetIsDirectory) {
        if (ignoredFilesSkipped) {
            console.log(
                [
                    `All files matching ${formattedExtensions} were skipped ${locationDescription} by ignore rules.`,
                    "Nothing to format.",
                    ignoredMessageSuffix
                ].join(" ")
            );
        } else {
            console.log(
                [
                    `No files matching ${formattedExtensions} were found ${locationDescription}.`,
                    "Nothing to format.",
                    guidance
                ].join(" ")
            );
        }
    } else {
        if (ignoredFilesSkipped) {
            console.log(
                [
                    `${locationDescription} was skipped by ignore rules and not formatted.`,
                    "Nothing to format.",
                    ignoredMessageSuffix
                ].join(" ")
            );
        } else {
            console.log(
                [
                    `${locationDescription} does not match the configured extensions ${formattedExtensions}.`,
                    "Nothing to format.",
                    guidance
                ].join(" ")
            );
        }
    }

    logSkippedFileSummary();
}

function describeDirectoryWithoutMatches({ formattedTargetPath, targetPathProvided }) {
    if (!targetPathProvided) {
        return "in the current working directory (.)";
    }

    if (formattedTargetPath === ".") {
        return "in the current directory";
    }

    return `in ${formattedTargetPath}`;
}

function logCheckModeSummary() {
    if (pendingFormatCount === 0) {
        console.log("All matched files are already formatted.");
        return;
    }

    const label = pendingFormatCount === 1 ? "file requires" : "files require";
    console.log(`${pendingFormatCount} ${label} formatting. Re-run without --check to write changes.`);
}

function logWriteModeSummary({
    targetPath,
    targetIsDirectory,
    targetPathProvided
}: {
    targetPath?: string;
    targetIsDirectory?: boolean;
    targetPathProvided?: boolean;
}) {
    if (formattedFileCount === 0) {
        console.log("All matched files are already formatted.");
        return;
    }

    const label = formattedFileCount === 1 ? "file" : "files";

    // Try to include a location phrase when logging from directory targets.
    // The tests expect a phrase like "found in the current working directory (.)"
    // which we'll construct without duplicating punctuation.
    let message = `Formatted ${formattedFileCount} ${label}.`;
    if (targetIsDirectory) {
        // Compose a phrase for the location that avoids starting with 'in ' so
        // we can naturaly say 'found in <location>'.
        const formattedTarget = formatPathForDisplay(targetPath || ".");
        const locationPhrase = formatLocationPhrase({
            formattedTargetPath: formattedTarget,
            targetPathProvided
        });
        message = `Formatted ${formattedFileCount} ${label} found in ${locationPhrase}.`;
        // When the wrapper runs against the current working directory (no
        // explicit target path provided) remind users of the recommended
        // CLI/workspace wrapper usage examples so they can adopt a scoped
        // workflow rather than running across the repository.
        if (!targetPathProvided) {
            const exampleGuidance = `For example: ${FORMAT_COMMAND_CLI_EXAMPLE} or ${FORMAT_COMMAND_WORKSPACE_EXAMPLE}.`;
            message = `${message} ${exampleGuidance}`;
        }
    }

    console.log(message);
}

function formatLocationPhrase({
    formattedTargetPath,
    targetPathProvided
}: {
    formattedTargetPath: string;
    targetPathProvided: boolean | undefined;
}) {
    // For the current working directory invocation where no targetPath was
    // provided we prefer the explicit phrase used elsewhere in the CLI helpers
    // without a leading 'in', so it can be used following 'found'.
    if (!targetPathProvided) {
        return "the current working directory (.)";
    }

    if (formattedTargetPath === ".") {
        return "the current directory";
    }

    return formattedTargetPath;
}

function logFormattingErrorSummary() {
    if (formattingErrorCount === 0) {
        return;
    }

    const failureLabel = formattingErrorCount === 1 ? "file" : "files";
    console.error(
        [
            `Formatting failed for ${formattingErrorCount} ${failureLabel}.`,
            "Review the errors above for details.",
            "Adjust --on-parse-error (skip, abort, or revert) if you need to change how failures are handled."
        ].join(" ")
    );
}

/**
 * Build human-readable detail messages describing skipped file categories.
 *
 * @param {{
 *     ignored: number,
 *     unsupportedExtension: number,
 *     unsupportedExtensionSamples: readonly string[],
 *     symbolicLink: number
 * }} summary
 * @returns {string[]}
 */
function formatSampleSuffix(formattedSamples, totalCount) {
    if (formattedSamples.length === 0) {
        return "";
    }

    const sampleList = formattedSamples.join(", ");
    const ellipsis = totalCount > formattedSamples.length ? ", ..." : "";
    return ` (e.g., ${sampleList}${ellipsis})`;
}

function formatIgnoredFileSample(sample) {
    if (!sample || typeof sample !== "object") {
        return null;
    }

    const { filePath, sourceDescription } = sample;
    if (typeof filePath !== "string" || filePath.length === 0) {
        return null;
    }

    const formattedPath = formatPathForDisplay(filePath);

    if (!sourceDescription || sourceDescription === "ignored") {
        return formattedPath;
    }

    return `${formattedPath} (${sourceDescription})`;
}

function formatIgnoredDetail({ ignored, ignoredSamples }) {
    if (ignored <= 0) {
        return null;
    }

    const formattedSamples = compactArray((ignoredSamples ?? []).map((sample) => formatIgnoredFileSample(sample)));
    const suffix = formatSampleSuffix(formattedSamples, ignored);

    return `ignored by .prettierignore (${ignored})${suffix}`;
}

function formatUnsupportedExtensionSample(sample) {
    if (typeof sample !== "string" || sample.length === 0) {
        return null;
    }

    return formatPathForDisplay(sample);
}

function formatUnsupportedExtensionDetail({ unsupportedExtension, unsupportedExtensionSamples }) {
    if (unsupportedExtension <= 0) {
        return null;
    }

    const formattedSamples = compactArray(
        (unsupportedExtensionSamples ?? []).map((sample) => formatUnsupportedExtensionSample(sample))
    );
    const suffix = formatSampleSuffix(formattedSamples, unsupportedExtension);

    return `unsupported extensions (${unsupportedExtension})${suffix}`;
}

function formatSymbolicLinkDetail(symbolicLink) {
    if (symbolicLink <= 0) {
        return null;
    }

    return `symbolic links (${symbolicLink})`;
}

function buildSkippedFileDetailEntries({
    ignored,
    ignoredSamples,
    unsupportedExtension,
    unsupportedExtensionSamples,
    symbolicLink
}) {
    const detailEntries = [];

    const ignoredDetail = formatIgnoredDetail({
        ignored,
        ignoredSamples
    });
    if (ignoredDetail) {
        detailEntries.push(ignoredDetail);
    }

    const unsupportedExtensionDetail = formatUnsupportedExtensionDetail({
        unsupportedExtension,
        unsupportedExtensionSamples
    });
    if (unsupportedExtensionDetail) {
        detailEntries.push(unsupportedExtensionDetail);
    }

    const symbolicLinkDetail = formatSymbolicLinkDetail(symbolicLink);
    if (symbolicLinkDetail) {
        detailEntries.push(symbolicLinkDetail);
    }

    return detailEntries;
}

function logSkippedFileSummary() {
    const directorySummaryMessage = buildSkippedDirectorySummaryMessage();

    if (directorySummaryMessage) {
        console.log(directorySummaryMessage);
    }

    const skippedFileCount =
        skippedFileSummary.ignored + skippedFileSummary.unsupportedExtension + skippedFileSummary.symbolicLink;
    const skipLabel = skippedFileCount === 1 ? "file" : "files";
    const summary = `Skipped ${skippedFileCount} ${skipLabel}.`;

    if (skippedFileCount === 0) {
        console.log(summary);
        return;
    }

    const detailEntries = buildSkippedFileDetailEntries(skippedFileSummary);

    if (detailEntries.length === 0) {
        console.log(summary);
        return;
    }

    console.log(`${summary} Breakdown: ${detailEntries.join("; ")}.`);
}

function buildSkippedDirectorySummaryMessage() {
    const { ignored, ignoredSamples } = skippedDirectorySummary;

    if (ignored === 0) {
        return null;
    }

    const label = ignored === 1 ? "directory" : "directories";
    const formattedSamples = ignoredSamples.map((directory) => formatPathForDisplay(directory));

    if (formattedSamples.length === 0) {
        return `Skipped ${ignored} ${label} ignored by .prettierignore.`;
    }

    const sampleList = formattedSamples.join(", ");
    const suffix = ignored > formattedSamples.length ? ", ..." : "";
    return `Skipped ${ignored} ${label} ignored by .prettierignore (e.g., ${sampleList}${suffix}).`;
}

function normalizeCommandLineArguments(argv) {
    if (!isNonEmptyArray(argv)) {
        // When no arguments are provided, default behavior depends on
        // PRETTIER_PLUGIN_GML_DEFAULT_ACTION environment variable.
        // Default is to show help (user-friendly for first-time users).
        // Set PRETTIER_PLUGIN_GML_DEFAULT_ACTION=format for legacy behavior.
        return resolveDefaultAction() === FORMAT_ACTION ? [] : ["--help"];
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
    normalizeCommandLineArguments,
    configurePrettierOptionsForTests: configurePrettierOptions,
    getPrettierOptionsForTests: () => options,
    validateTargetPathInputForTests: validateTargetPathInput,
    resolveTargetPathFromInputForTests: resolveTargetPathFromInput
});

const formatCommand = createFormatCommand({ name: FORMAT_ACTION });

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

    cliCommandRunner.run(normalizedArguments).catch((error) => {
        handleCliError(error, {
            prefix: "Failed to run prettier-plugin-gml CLI.",
            exitCode: 1
        });
    });
}
/**
 * Check equality of ignored file samples by comparing both path and source description.
 *
 * @param {object} existing - The existing sample
 * @param {object} candidate - The candidate sample
 * @returns {boolean} True if samples are equal
 */
function areIgnoredFileSamplesEqual(existing, candidate) {
    return existing?.filePath === candidate?.filePath && existing?.sourceDescription === candidate?.sourceDescription;
}

function recordIgnoredFile({ filePath, sourceDescription }) {
    skippedFileSummary.ignored += 1;

    const limit = getIgnoredFileSampleLimit();
    const sample = { filePath, sourceDescription };

    if (tryAddSample(skippedFileSummary.ignoredSamples, sample, limit, areIgnoredFileSamplesEqual)) {
        console.log(`Skipping ${filePath} (${sourceDescription})`);
    }
}
function recordUnsupportedExtension(filePath) {
    skippedFileSummary.unsupportedExtension += 1;
    const limit = getUnsupportedExtensionSampleLimit();
    tryAddSample(skippedFileSummary.unsupportedExtensionSamples, filePath, limit);
}
