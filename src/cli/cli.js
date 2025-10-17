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

import {
    lstat,
    mkdtemp,
    readdir,
    readFile,
    rm,
    stat,
    writeFile
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { Command, InvalidArgumentError } from "commander";

import {
    asArray,
    mergeUniqueValues,
    uniqueArray
} from "../shared/array-utils.js";
import { isErrorLike } from "../shared/utils/capability-probes.js";
import {
    normalizeStringList,
    toNormalizedLowerCaseString,
    toNormalizedLowerCaseSet
} from "../shared/string-utils.js";
import { isPathInside } from "../shared/path-utils.js";
import { collectAncestorDirectories } from "./lib/ancestor-directories.js";

import {
    CliUsageError,
    formatCliError,
    handleCliError
} from "./lib/cli-errors.js";
import { parseCommandLine } from "./lib/command-parsing.js";
import { applyStandardCommandOptions } from "./lib/command-standard-options.js";
import { resolvePluginEntryPoint } from "./lib/plugin-entry-point.js";
import {
    hasRegisteredIgnorePath,
    registerIgnorePath,
    resetRegisteredIgnorePaths
} from "./lib/ignore-path-registry.js";

const WRAPPER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolvePluginEntryPoint();
const IGNORE_PATH = path.resolve(WRAPPER_DIRECTORY, ".prettierignore");

const FALLBACK_EXTENSIONS = Object.freeze([".gml"]);

const ParseErrorAction = Object.freeze({
    REVERT: "revert",
    SKIP: "skip",
    ABORT: "abort"
});

const VALID_PARSE_ERROR_ACTIONS = new Set(Object.values(ParseErrorAction));

function normalizeParseErrorAction(value, fallbackValue) {
    if (value == undefined) {
        return fallbackValue;
    }

    const normalized = toNormalizedLowerCaseString(value);

    if (normalized.length === 0) {
        return fallbackValue;
    }

    if (VALID_PARSE_ERROR_ACTIONS.has(normalized)) {
        return normalized;
    }

    return null;
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
    const candidateValues = normalizeStringList(rawExtensions, {
        splitPattern: /,/,
        allowInvalidType: true
    });

    const normalized = mergeUniqueValues([], candidateValues, {
        coerce: coerceExtensionValue,
        freeze: false
    });

    return normalized.length > 0 ? normalized : fallbackExtensions;
}

const DEFAULT_EXTENSIONS = normalizeExtensions(
    process.env.PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS,
    FALLBACK_EXTENSIONS
);

const DEFAULT_PARSE_ERROR_ACTION =
    normalizeParseErrorAction(
        process.env.PRETTIER_PLUGIN_GML_ON_PARSE_ERROR,
        ParseErrorAction.SKIP
    ) ?? ParseErrorAction.SKIP;

const cliArgs = process.argv.slice(2);

function parseCliArguments(args) {
    const command = applyStandardCommandOptions(
        new Command()
            .name("prettier-wrapper")
            .usage("[options] <path>")
            .description(
                "Format GameMaker Language files using the prettier plugin."
            )
    )
        .argument("[targetPath]", "Directory or file to format.")
        .option(
            "--path <path>",
            "Directory or file to format (alias for positional argument)."
        )
        .option(
            "--extensions <list>",
            "Comma-separated list of file extensions to format.",
            (value) => normalizeExtensions(value, DEFAULT_EXTENSIONS)
        )
        .option(
            "--on-parse-error <mode>",
            "How to handle parser failures: revert, skip, or abort.",
            (value) => {
                const normalized = normalizeParseErrorAction(
                    value,
                    DEFAULT_PARSE_ERROR_ACTION
                );
                if (!normalized) {
                    throw new InvalidArgumentError(
                        `Must be one of: ${[...VALID_PARSE_ERROR_ACTIONS]
                            .sort()
                            .join(", ")}`
                    );
                }
                return normalized;
            },
            DEFAULT_PARSE_ERROR_ACTION
        );

    const { helpRequested, usage } = parseCommandLine(command, args);
    if (helpRequested) {
        return {
            helpRequested: true,
            usage
        };
    }

    const options = command.opts();
    const [positionalTarget] = command.processedArgs;
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

    return {
        helpRequested: false,
        targetPathInput: options.path ?? positionalTarget ?? null,
        extensions: Array.isArray(extensions)
            ? extensions
            : [...(extensions ?? DEFAULT_EXTENSIONS)],
        onParseError: options.onParseError ?? DEFAULT_PARSE_ERROR_ACTION,
        usage
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
    loglevel: "warn",
    ignorePath: IGNORE_PATH,
    noErrorOnUnmatchedPattern: true
};

let skippedFileCount = 0;
let baseProjectIgnorePaths = [];
const baseProjectIgnorePathSet = new Set();
let encounteredFormattingError = false;
let ignoreRulesContainNegations = false;
let parseErrorAction = DEFAULT_PARSE_ERROR_ACTION;
let abortRequested = false;
let revertTriggered = false;
const formattedFileOriginalContents = new Map();
let revertSnapshotDirectoryPromise = null;
let revertSnapshotDirectory = null;
let revertSnapshotFileCount = 0;

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
        // Ignore cleanup failures; the OS will eventually purge the temp dir.
    }
}

async function releaseSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
        return;
    }

    const snapshotPath = snapshot.snapshotPath;
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
}

async function discardFormattedFileOriginalContents() {
    const snapshots = [...formattedFileOriginalContents.values()];
    formattedFileOriginalContents.clear();

    for (const snapshot of snapshots) {
        // shared snapshot counter accurate and the directory removal deterministic.
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

    if (snapshot.inlineContents != null) {
        return snapshot.inlineContents;
    }

    if (!snapshot.snapshotPath) {
        return "";
    }

    try {
        return await readFile(snapshot.snapshotPath, "utf8");
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
    skippedFileCount = 0;
    encounteredFormattingError = false;
    resetRegisteredIgnorePaths();
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
            const message =
                revertError && typeof revertError.message === "string"
                    ? revertError.message
                    : String(revertError ?? "");
            console.error(
                `Failed to revert ${filePath}: ${message || "Unknown error"}`
            );
        } finally {
            // the counter and directory lifecycle deterministic.
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

    if (parseErrorAction === ParseErrorAction.REVERT) {
        if (!revertTriggered) {
            revertTriggered = true;
            abortRequested = true;
            await revertFormattedFiles();
        }
    } else if (parseErrorAction === ParseErrorAction.ABORT) {
        abortRequested = true;
    }
}

async function registerIgnorePaths(ignoreFiles) {
    for (const ignoreFilePath of ignoreFiles) {
        if (!ignoreFilePath || hasRegisteredIgnorePath(ignoreFilePath)) {
            continue;
        }

        registerIgnorePath(ignoreFilePath);

        try {
            const contents = await readFile(ignoreFilePath, "utf8");
            const hasNegation = contents
                .split(/\r?\n/)
                .map((line) => line.trim())
                .some((line) => line.startsWith("!") && line.length > 1);

            if (hasNegation) {
                ignoreRulesContainNegations = true;
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
    if (ignoreRulesContainNegations) {
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

    try {
        const fileInfo = await prettier.getFileInfo(placeholderPath, {
            ignorePath: ignorePathOption,
            plugins: options.plugins,
            resolveConfig: true
        });

        if (fileInfo.ignored) {
            console.log(`Skipping ${directory} (ignored directory)`);
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
        const details = formatCliError(error) || "Unknown error";
        const cliError = new CliUsageError(
            `Unable to access ${target}: ${details}`,
            { usage }
        );
        if (isErrorLike(error)) {
            cliError.cause = error;
        }
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
        skippedFileCount += 1;
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

    skippedFileCount += 1;
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
    let resolvedConfig = null;

    try {
        resolvedConfig = await prettier.resolveConfig(filePath, {
            editorconfig: true
        });
    } catch (error) {
        console.warn(
            `Unable to resolve Prettier config for ${filePath}: ${error.message}`
        );
    }

    const mergedOptions = {
        ...options,
        ...resolvedConfig,
        filepath: filePath
    };

    const basePlugins = asArray(options.plugins);
    const resolvedPlugins = asArray(resolvedConfig?.plugins);
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
        const ignorePathOption = getIgnorePathOptions(activeIgnorePaths);
        const fileInfo = await prettier.getFileInfo(filePath, {
            ...(ignorePathOption ? { ignorePath: ignorePathOption } : {}),
            plugins: formattingOptions.plugins,
            resolveConfig: true
        });

        if (fileInfo.ignored) {
            console.log(`Skipping ${filePath} (ignored)`);
            return;
        }

        const data = await readFile(filePath, "utf8");
        const formatted = await prettier.format(data, formattingOptions);

        if (formatted === data) {
            return;
        }

        await recordFormattedFileOriginalContents(filePath, data);
        await writeFile(filePath, formatted);
        console.log(`Formatted ${filePath}`);
    } catch (error) {
        await handleFormattingError(error, filePath);
    }
}

async function run() {
    const {
        targetPathInput,
        extensions: configuredExtensions,
        onParseError,
        helpRequested,
        usage
    } = parseCliArguments(cliArgs);

    if (helpRequested) {
        return;
    }

    if (!targetPathInput) {
        throw new CliUsageError(
            "No target project provided. Pass a directory path as the first argument or use --path=/absolute/to/project.",
            { usage }
        );
    }

    const targetPath = path.resolve(process.cwd(), targetPathInput);
    configureTargetExtensionState(configuredExtensions);
    await resetFormattingSession(onParseError);

    try {
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

        await initializeProjectIgnorePaths(projectRoot);
        if (targetIsDirectory) {
            await processDirectory(targetPath);
        } else if (shouldFormatFile(targetPath)) {
            await processFile(targetPath, baseProjectIgnorePaths);
        } else {
            skippedFileCount += 1;
        }
        console.debug(`Skipped ${skippedFileCount} files`);
        if (encounteredFormattingError) {
            process.exitCode = 1;
        }
    } finally {
        await discardFormattedFileOriginalContents();
    }
}

run().catch((error) => {
    handleCliError(error, {
        prefix: "Failed to format project.",
        exitCode: 1
    });
});
