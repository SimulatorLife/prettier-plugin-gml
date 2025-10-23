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

import { randomUUID } from "node:crypto";
import {
    lstat,
    mkdtemp,
    readdir,
    readFile,
    rm,
    stat,
    writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Command, InvalidArgumentError, Option } from "commander";

import {
    getErrorMessage,
    getNonEmptyTrimmedString,
    isErrorWithCode,
    normalizeEnumeratedOption,
    normalizeStringList,
    toArray,
    toNormalizedLowerCaseSet,
    toNormalizedLowerCaseString,
    uniqueArray,
    withObjectLike
} from "../shared/utils.js";
import { isErrorLike } from "../shared/utils/capability-probes.js";
import {
    collectAncestorDirectories,
    isPathInside
} from "../shared/utils/path.js";
import {
    hasIgnoreRuleNegations,
    markIgnoreRuleNegationsDetected,
    resetIgnoreRuleNegations
} from "./lib/ignore-rules-negation-tracker.js";

import {
    CliUsageError,
    formatCliError,
    handleCliError
} from "./lib/cli-errors.js";
import { applyStandardCommandOptions } from "./lib/command-standard-options.js";
import { resolvePluginEntryPoint } from "./lib/plugin-entry-point.js";
import {
    hasRegisteredIgnorePath,
    registerIgnorePath,
    resetRegisteredIgnorePaths
} from "./lib/ignore-path-registry.js";
import { createCliCommandManager } from "./lib/cli-command-manager.js";
import { resolveCliVersion } from "./lib/cli-version.js";
import { wrapInvalidArgumentResolver } from "./lib/command-parsing.js";
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
import { resolveCliIdentifierCaseCacheClearer } from "./lib/plugin-services.js";
import {
    getDefaultSkippedDirectorySampleLimit,
    resolveSkippedDirectorySampleLimit,
    SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR
} from "./lib/skipped-directory-sample-limit.js";

const WRAPPER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolvePluginEntryPoint();
const IGNORE_PATH = path.resolve(WRAPPER_DIRECTORY, ".prettierignore");
const INITIAL_WORKING_DIRECTORY = path.resolve(process.cwd());

const FALLBACK_EXTENSIONS = Object.freeze([".gml"]);

const ParseErrorAction = Object.freeze({
    REVERT: "revert",
    SKIP: "skip",
    ABORT: "abort"
});

const VALID_PARSE_ERROR_ACTIONS = new Set(Object.values(ParseErrorAction));
const VALID_PRETTIER_LOG_LEVELS = new Set([
    "debug",
    "info",
    "warn",
    "error",
    "silent"
]);

function formatValidChoiceList(values) {
    return [...values].sort().join(", ");
}

const VALID_PARSE_ERROR_ACTION_CHOICES = formatValidChoiceList(
    VALID_PARSE_ERROR_ACTIONS
);
const VALID_PRETTIER_LOG_LEVEL_CHOICES = formatValidChoiceList(
    VALID_PRETTIER_LOG_LEVELS
);

const PRETTIER_MODULE_ID =
    process.env.PRETTIER_PLUGIN_GML_PRETTIER_MODULE ?? "prettier";

function formatExtensionListForDisplay(extensions) {
    return extensions.map((extension) => `"${extension}"`).join(", ");
}

function formatPathForDisplay(targetPath) {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedCwd = INITIAL_WORKING_DIRECTORY;
    const relativePath = path.relative(resolvedCwd, resolvedTarget);

    if (resolvedTarget === resolvedCwd) {
        return ".";
    }

    if (
        relativePath.length > 0 &&
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath)
    ) {
        return relativePath;
    }

    return resolvedTarget;
}

function isMissingPrettierDependency(error) {
    if (!isErrorWithCode(error, "ERR_MODULE_NOT_FOUND")) {
        return false;
    }

    const message = getErrorMessage(error, { fallback: "" });
    return message.includes("'prettier'");
}

let prettierModulePromise = null;

async function resolvePrettier() {
    if (!prettierModulePromise) {
        prettierModulePromise = import(PRETTIER_MODULE_ID)
            .then((module) => module?.default ?? module)
            .catch((error) => {
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

function coerceExtensionValue(value) {
    if (typeof value !== "string") {
        return null;
    }

    const cleaned = value
        .toLowerCase()
        // Drop any directory/glob prefixes (e.g. **/*.gml or src/**/*.yy).
        .replace(/.*[\\/]/, "")
        // Trim leading wildcard tokens like * or ? that commonly appear in glob patterns.
        .replace(/^[*?]+/, "");

    if (!cleaned) {
        return null;
    }

    return cleaned.startsWith(".") ? cleaned : `.${cleaned}`;
}

function normalizeExtensions(
    rawExtensions,
    fallbackExtensions = FALLBACK_EXTENSIONS
) {
    const normalized = Array.from(
        new Set(
            normalizeStringList(rawExtensions, {
                splitPattern: /,/,
                allowInvalidType: true
            })
                .map(coerceExtensionValue)
                .filter(Boolean)
        )
    );

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

const DEFAULT_EXTENSIONS = normalizeExtensions(
    process.env.PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS,
    FALLBACK_EXTENSIONS
);

const DEFAULT_PARSE_ERROR_ACTION =
    normalizeEnumeratedOption(
        process.env.PRETTIER_PLUGIN_GML_ON_PARSE_ERROR,
        ParseErrorAction.SKIP,
        VALID_PARSE_ERROR_ACTIONS
    ) ?? ParseErrorAction.SKIP;

const DEFAULT_PRETTIER_LOG_LEVEL =
    normalizeEnumeratedOption(
        process.env.PRETTIER_PLUGIN_GML_LOG_LEVEL,
        "warn",
        VALID_PRETTIER_LOG_LEVELS
    ) ?? "warn";

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

function createFormatCommand({ name = "prettier-plugin-gml" } = {}) {
    const extensionsOption = new Option(
        "--extensions <list>",
        [
            "Comma-separated list of file extensions to format.",
            `Defaults to ${formatExtensionListForDisplay(DEFAULT_EXTENSIONS)}.`,
            "Respects PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS when set."
        ].join(" ")
    )
        .argParser((value) => normalizeExtensions(value, DEFAULT_EXTENSIONS))
        .default(
            DEFAULT_EXTENSIONS,
            formatExtensionListForDisplay(DEFAULT_EXTENSIONS)
        );

    const defaultSkippedDirectorySampleLimit =
        getDefaultSkippedDirectorySampleLimit();

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
        .option(
            "--check",
            [
                "Check whether files are already formatted without writing changes.",
                "Exits with a non-zero status when differences are found."
            ].join(" ")
        )
        .addOption(extensionsOption)
        .option(
            "--log-level <level>",
            [
                "Prettier log level to use (debug, info, warn, error, or silent).",
                "Respects PRETTIER_PLUGIN_GML_LOG_LEVEL when set."
            ].join(" "),
            (value) => {
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
            },
            DEFAULT_PRETTIER_LOG_LEVEL
        )
        .option(
            "--on-parse-error <mode>",
            [
                "How to handle parser failures: revert, skip, or abort.",
                "Respects PRETTIER_PLUGIN_GML_ON_PARSE_ERROR when set."
            ].join(" "),
            (value) => {
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
            },
            DEFAULT_PARSE_ERROR_ACTION
        )
        .option(
            "--ignored-directory-samples <count>",
            [
                "Maximum number of ignored directories to include in summary output.",
                `Defaults to ${defaultSkippedDirectorySampleLimit}.`,
                `Respects ${SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR} when set. Provide 0 to suppress the sample list.`
            ].join(" "),
            wrapInvalidArgumentResolver(resolveSkippedDirectorySampleLimit),
            defaultSkippedDirectorySampleLimit
        );
}

/**
 * Normalize CLI target path input into a trimmed value plus a flag indicating
 * whether the user explicitly supplied a path argument.
 *
 * @param {unknown} rawInput
 * @returns {{ targetPathInput: unknown, targetPathProvided: boolean }}
 */
function normalizeTargetPathInput(rawInput) {
    if (typeof rawInput === "string") {
        const trimmed = getNonEmptyTrimmedString(rawInput);
        return {
            targetPathInput: trimmed ?? null,
            targetPathProvided: true
        };
    }

    const normalized = rawInput ?? null;
    return {
        targetPathInput: normalized,
        targetPathProvided: normalized !== null
    };
}

function collectFormatCommandOptions(command) {
    const options = command.opts();
    const [positionalTarget] = command.args ?? [];
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

    const { targetPathInput, targetPathProvided } = normalizeTargetPathInput(
        options.path ?? positionalTarget ?? null
    );

    return {
        targetPathInput,
        targetPathProvided,
        extensions: Array.isArray(extensions)
            ? extensions
            : [...(extensions ?? DEFAULT_EXTENSIONS)],
        prettierLogLevel: options.logLevel ?? DEFAULT_PRETTIER_LOG_LEVEL,
        onParseError: options.onParseError ?? DEFAULT_PARSE_ERROR_ACTION,
        checkMode: Boolean(options.check),
        skippedDirectorySampleLimit: options.ignoredDirectorySamples,
        usage: command.helpInformation()
    };
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
let placeholderExtension =
    targetExtensions[0] ?? DEFAULT_EXTENSIONS[0] ?? FALLBACK_EXTENSIONS[0];

/**
 * Apply CLI configuration that influences which files are formatted.
 *
 * @param {readonly string[]} configuredExtensions
 */
function configureTargetExtensionState(configuredExtensions) {
    targetExtensions =
        configuredExtensions.length > 0
            ? configuredExtensions
            : DEFAULT_EXTENSIONS;
    targetExtensionSet = createTargetExtensionSet(targetExtensions);
    placeholderExtension =
        targetExtensions[0] ?? DEFAULT_EXTENSIONS[0] ?? FALLBACK_EXTENSIONS[0];
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
    loglevel: DEFAULT_PRETTIER_LOG_LEVEL,
    ignorePath: IGNORE_PATH,
    noErrorOnUnmatchedPattern: true
};

function configurePrettierOptions({ logLevel } = {}) {
    const normalized =
        normalizeEnumeratedOption(
            logLevel,
            DEFAULT_PRETTIER_LOG_LEVEL,
            VALID_PRETTIER_LOG_LEVELS
        ) ?? DEFAULT_PRETTIER_LOG_LEVEL;
    options.loglevel = normalized;
}

const skippedFileSummary = {
    ignored: 0,
    unsupportedExtension: 0,
    symbolicLink: 0
};

const skippedDirectorySummary = {
    ignored: 0,
    ignoredSamples: []
};

let checkModeEnabled = false;
let pendingFormatCount = 0;

function resetCheckModeTracking() {
    pendingFormatCount = 0;
}

function configureCheckMode(enabled) {
    checkModeEnabled = Boolean(enabled);
    resetCheckModeTracking();
}

let skippedDirectorySampleLimit = getDefaultSkippedDirectorySampleLimit();

function configureSkippedDirectorySampleLimit(limit) {
    skippedDirectorySampleLimit = resolveSkippedDirectorySampleLimit(limit);
}

function resetSkippedFileSummary() {
    skippedFileSummary.ignored = 0;
    skippedFileSummary.unsupportedExtension = 0;
    skippedFileSummary.symbolicLink = 0;
}

function resetSkippedDirectorySummary() {
    skippedDirectorySummary.ignored = 0;
    skippedDirectorySummary.ignoredSamples.length = 0;
}

function recordSkippedDirectory(directory) {
    skippedDirectorySummary.ignored += 1;

    if (
        skippedDirectorySampleLimit > 0 &&
        skippedDirectorySummary.ignoredSamples.length <
            skippedDirectorySampleLimit &&
        !skippedDirectorySummary.ignoredSamples.includes(directory)
    ) {
        skippedDirectorySummary.ignoredSamples.push(directory);
    }
}
let baseProjectIgnorePaths = [];
const baseProjectIgnorePathSet = new Set();
let encounteredFormattingError = false;
const NEGATED_IGNORE_RULE_PATTERN = /^\s*!.*\S/m;
let parseErrorAction = DEFAULT_PARSE_ERROR_ACTION;
let abortRequested = false;
let revertTriggered = false;
const formattedFileOriginalContents = new Map();
let revertSnapshotDirectoryPromise = null;
let revertSnapshotDirectory = null;
let revertSnapshotFileCount = 0;
let encounteredFormattableFile = false;

function clearIdentifierCaseCaches() {
    const clearCaches = resolveCliIdentifierCaseCacheClearer();
    clearCaches();
}

async function ensureRevertSnapshotDirectory() {
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
    await withObjectLike(snapshot, async (snapshotObject) => {
        const { snapshotPath } = snapshotObject;
        if (!snapshotPath) {
            return;
        }

        try {
            await rm(snapshotPath, { force: true });
        } catch {
            // Ignore individual file cleanup failures to avoid masking the
            // original error that triggered the revert.
        } finally {
            if (revertSnapshotFileCount > 0) {
                revertSnapshotFileCount -= 1;
            }
        }
    });
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

    if (inlineContents != null) {
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
    clearIdentifierCaseCaches();
    resetSkippedFileSummary();
    resetSkippedDirectorySummary();
    encounteredFormattingError = false;
    resetRegisteredIgnorePaths();
    resetIgnoreRuleNegations();
    encounteredFormattableFile = false;
    resetCheckModeTracking();
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
        // Fallback to storing the contents in memory if writing to disk fails.
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
            const message = getErrorMessage(revertError);
            console.error(
                `Failed to revert ${filePath}: ${message || "Unknown error"}`
            );
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

async function handleFormattingError(error, filePath) {
    encounteredFormattingError = true;
    const formattedError = formatCliError(error);
    const header = `Failed to format ${filePath}`;

    if (formattedError) {
        const indented = formattedError
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n");
        console.error(`${header}\n${indented}`);
    } else {
        console.error(header);
    }

    if (parseErrorAction !== ParseErrorAction.REVERT) {
        if (parseErrorAction === ParseErrorAction.ABORT) {
            abortRequested = true;
        }
        return;
    }

    if (revertTriggered) {
        return;
    }

    revertTriggered = true;
    abortRequested = true;
    await revertFormattedFiles();
}

async function registerIgnorePaths(ignoreFiles) {
    for (const ignoreFilePath of ignoreFiles) {
        if (!ignoreFilePath || hasRegisteredIgnorePath(ignoreFilePath)) {
            continue;
        }

        registerIgnorePath(ignoreFilePath);

        if (hasIgnoreRuleNegations()) {
            continue;
        }

        try {
            const contents = await readFile(ignoreFilePath, "utf8");

            if (NEGATED_IGNORE_RULE_PATTERN.test(contents)) {
                markIgnoreRuleNegationsDetected();
            }
        } catch {
            // Ignore missing or unreadable files.
        }
    }
}

function getIgnorePathOptions(additionalIgnorePaths = []) {
    const ignoreCandidates = [
        IGNORE_PATH,
        ...baseProjectIgnorePaths,
        ...additionalIgnorePaths
    ].filter(Boolean);
    if (ignoreCandidates.length === 0) {
        return null;
    }

    const uniqueIgnorePaths = uniqueArray(ignoreCandidates);
    return uniqueIgnorePaths.length === 1
        ? uniqueIgnorePaths[0]
        : uniqueIgnorePaths;
}

async function shouldSkipDirectory(directory, activeIgnorePaths = []) {
    if (hasIgnoreRuleNegations()) {
        return false;
    }

    const ignorePathOption = getIgnorePathOptions(activeIgnorePaths);
    if (!ignorePathOption) {
        return false;
    }

    const placeholderPath = path.join(
        directory,
        `__prettier_plugin_gml_ignore_test__${placeholderExtension}`
    );

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
        console.warn(
            `Unable to evaluate ignore rules for ${directory}: ${error.message}`
        );
    }

    return false;
}

async function resolveProjectIgnorePaths(directory) {
    const resolvedDirectory = path.resolve(directory);
    const resolvedWorkingDirectory = path.resolve(process.cwd());
    const directoriesToInspect = collectAncestorDirectories(
        resolvedDirectory,
        isPathInside(resolvedWorkingDirectory, resolvedDirectory)
            ? resolvedWorkingDirectory
            : null
    );

    const candidatePaths = directoriesToInspect.map((candidateDirectory) =>
        path.join(candidateDirectory, ".prettierignore")
    );

    const discovered = await Promise.all(
        candidatePaths.map(async (ignoreCandidate) => {
            try {
                const stats = await stat(ignoreCandidate);
                return stats.isFile() ? ignoreCandidate : null;
            } catch {
                // Ignore missing files.
                return null;
            }
        })
    );

    return discovered.filter(Boolean);
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

async function resolveTargetStats(target, { usage } = {}) {
    try {
        return await stat(target);
    } catch (error) {
        const details =
            getErrorMessage(error, { fallback: "Unknown error" }) ||
            "Unknown error";
        const cliError = new CliUsageError(
            `Unable to access ${target}: ${details}`,
            { usage }
        );
        throw cliError;
    }
}

async function resolveDirectoryIgnoreContext(directory, inheritedIgnorePaths) {
    const localIgnorePath = path.join(directory, ".prettierignore");
    let effectiveIgnorePaths = inheritedIgnorePaths;
    let shouldRegisterLocalIgnore =
        baseProjectIgnorePathSet.has(localIgnorePath);

    try {
        const ignoreStats = await stat(localIgnorePath);

        if (ignoreStats.isFile()) {
            shouldRegisterLocalIgnore = true;

            if (!inheritedIgnorePaths.includes(localIgnorePath)) {
                effectiveIgnorePaths = [
                    ...inheritedIgnorePaths,
                    localIgnorePath
                ];
            }
        }
    } catch {
        // Ignore missing files.
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
        encounteredFormattableFile = true;
        await processFile(filePath, currentIgnorePaths);
        return;
    }

    skippedFileSummary.unsupportedExtension += 1;
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

    const { effectiveIgnorePaths, localIgnorePath, shouldRegisterLocalIgnore } =
        await resolveDirectoryIgnoreContext(directory, inheritedIgnorePaths);

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
        const message = getErrorMessage(error, { fallback: "Unknown error" });
        console.warn(
            `Unable to resolve Prettier config for ${filePath}: ${message}`
        );
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
            console.log(`Skipping ${filePath} (ignored)`);
            skippedFileSummary.ignored += 1;
            return;
        }

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
function validateTargetPathInput({
    targetPathProvided,
    targetPathInput,
    usage
}) {
    if (targetPathProvided && !targetPathInput) {
        throw new CliUsageError(
            [
                "Target path cannot be empty. Pass a directory or file to format (relative or absolute) or omit --path to format the current working directory.",
                "If the path conflicts with a command name, invoke the format subcommand explicitly (prettier-plugin-gml format <path>)."
            ].join(" "),
            { usage }
        );
    }
}

/**
 * Resolve the file system path that should be formatted.
 *
 * @param {unknown} targetPathInput
 * @returns {string}
 */
function resolveTargetPathFromInput(targetPathInput) {
    return path.resolve(process.cwd(), targetPathInput ?? ".");
}

/**
 * Configure global state for a formatting run based on CLI flags.
 *
 * @param {{
 *   configuredExtensions: readonly string[],
 *   prettierLogLevel: string,
 *   onParseError: string,
 *   skippedDirectorySampleLimit: number
 * }} params
 */
async function prepareFormattingRun({
    configuredExtensions,
    prettierLogLevel,
    onParseError,
    skippedDirectorySampleLimit,
    checkMode
}) {
    configurePrettierOptions({ logLevel: prettierLogLevel });
    configureTargetExtensionState(configuredExtensions);
    configureSkippedDirectorySampleLimit(skippedDirectorySampleLimit);
    await resetFormattingSession(onParseError);
    configureCheckMode(checkMode);
}

/**
 * Resolve metadata about the requested target and ensure it can be formatted.
 *
 * @param {string} targetPath
 * @param {string} usage
 * @returns {Promise<{ targetIsDirectory: boolean, projectRoot: string }>}
 */
async function resolveTargetContext(targetPath, usage) {
    const targetStats = await resolveTargetStats(targetPath, { usage });
    const targetIsDirectory = targetStats.isDirectory();

    if (!targetIsDirectory && !targetStats.isFile()) {
        throw new CliUsageError(
            `${targetPath} is not a file or directory that can be formatted`,
            { usage }
        );
    }

    const projectRoot = targetIsDirectory
        ? targetPath
        : path.dirname(targetPath);

    return { targetIsDirectory, projectRoot };
}

/**
 * Process a single-file target when the CLI input does not resolve to a directory.
 *
 * @param {string} targetPath
 */
async function processNonDirectoryTarget(targetPath) {
    if (shouldFormatFile(targetPath)) {
        encounteredFormattableFile = true;
        await processFile(targetPath, baseProjectIgnorePaths);
        return;
    }

    skippedFileSummary.unsupportedExtension += 1;
}

/**
 * Execute formatting for the resolved target after validation.
 *
 * @param {{ targetPath: string, targetIsDirectory: boolean, projectRoot: string }} params
 */
async function processResolvedTarget({
    targetPath,
    targetIsDirectory,
    projectRoot
}) {
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
function finalizeFormattingRun({ targetPath, targetIsDirectory }) {
    if (encounteredFormattableFile) {
        if (checkModeEnabled) {
            logCheckModeSummary();
        }
        logSkippedFileSummary();
    } else {
        logNoMatchingFiles({
            targetPath,
            targetIsDirectory,
            extensions: targetExtensions
        });
    }

    if (checkModeEnabled && pendingFormatCount > 0) {
        process.exitCode = 1;
    }
    if (encounteredFormattingError) {
        process.exitCode = 1;
    }
}

/**
 * Fully execute the formatting workflow for a validated target path.
 *
 * @param {{ targetPath: string, usage: string }} params
 */
async function runFormattingWorkflow({ targetPath, usage }) {
    const { targetIsDirectory, projectRoot } = await resolveTargetContext(
        targetPath,
        usage
    );

    await processResolvedTarget({
        targetPath,
        targetIsDirectory,
        projectRoot
    });

    finalizeFormattingRun({ targetPath, targetIsDirectory });
}

async function executeFormatCommand(command) {
    const commandOptions = collectFormatCommandOptions(command);
    const { usage, targetPathInput, skippedDirectorySampleLimit } =
        commandOptions;

    validateTargetPathInput(commandOptions);

    const targetPath = resolveTargetPathFromInput(targetPathInput);
    await prepareFormattingRun({
        configuredExtensions: commandOptions.extensions,
        prettierLogLevel: commandOptions.prettierLogLevel,
        onParseError: commandOptions.onParseError,
        skippedDirectorySampleLimit,
        checkMode: commandOptions.checkMode
    });

    try {
        await runFormattingWorkflow({ targetPath, usage });
    } finally {
        await discardFormattedFileOriginalContents();
        clearIdentifierCaseCaches();
    }
}

function logNoMatchingFiles({ targetPath, targetIsDirectory, extensions }) {
    const formattedExtensions = formatExtensionListForDisplay(extensions);
    const formattedTarget = formatPathForDisplay(targetPath);
    const directoryDescription =
        targetIsDirectory && formattedTarget === "."
            ? "the current directory"
            : formattedTarget;
    const guidance = targetIsDirectory
        ? "Adjust --extensions or update your .prettierignore files if this is unexpected."
        : "Pass --extensions to include this file or adjust your .prettierignore files if this is unexpected.";

    if (targetIsDirectory) {
        console.log(
            [
                `No files matching ${formattedExtensions} were found in ${directoryDescription}.`,
                "Nothing to format.",
                guidance
            ].join(" ")
        );
    } else {
        console.log(
            [
                `${formattedTarget} does not match the configured extensions ${formattedExtensions}.`,
                "Nothing to format.",
                guidance
            ].join(" ")
        );
    }

    logSkippedFileSummary();
}

function logCheckModeSummary() {
    if (pendingFormatCount === 0) {
        console.log("All matched files are already formatted.");
        return;
    }

    const label = pendingFormatCount === 1 ? "file requires" : "files require";
    console.log(
        `${pendingFormatCount} ${label} formatting. Re-run without --check to write changes.`
    );
}

/**
 * Build human-readable detail messages describing skipped file categories.
 *
 * @param {{ ignored: number, unsupportedExtension: number, symbolicLink: number }} summary
 * @returns {string[]}
 */
function buildSkippedFileDetailEntries({
    ignored,
    unsupportedExtension,
    symbolicLink
}) {
    const detailEntries = [];

    if (ignored > 0) {
        detailEntries.push(`ignored by .prettierignore (${ignored})`);
    }

    if (unsupportedExtension > 0) {
        detailEntries.push(`unsupported extensions (${unsupportedExtension})`);
    }

    if (symbolicLink > 0) {
        detailEntries.push(`symbolic links (${symbolicLink})`);
    }

    return detailEntries;
}

function logSkippedFileSummary() {
    const directorySummaryMessage = buildSkippedDirectorySummaryMessage();

    if (directorySummaryMessage) {
        console.log(directorySummaryMessage);
    }

    const skippedFileCount =
        skippedFileSummary.ignored +
        skippedFileSummary.unsupportedExtension +
        skippedFileSummary.symbolicLink;
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
    const formattedSamples = ignoredSamples.map((directory) =>
        formatPathForDisplay(directory)
    );

    if (formattedSamples.length === 0) {
        return `Skipped ${ignored} ${label} ignored by .prettierignore.`;
    }

    const sampleList = formattedSamples.join(", ");
    const suffix = ignored > formattedSamples.length ? ", ..." : "";
    return `Skipped ${ignored} ${label} ignored by .prettierignore (e.g., ${sampleList}${suffix}).`;
}

export const __test__ = Object.freeze({
    resetFormattingSessionForTests: resetFormattingSession
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
    cliCommandRunner.run(process.argv.slice(2)).catch((error) => {
        handleCliError(error, {
            prefix: "Failed to run prettier-plugin-gml CLI.",
            exitCode: 1
        });
    });
}
