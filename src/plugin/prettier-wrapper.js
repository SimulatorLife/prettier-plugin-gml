import prettier from "prettier";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { lstat, readdir, readFile, stat, writeFile } from "node:fs/promises";

import { asArray } from "../shared/array-utils.js";

import {
    CliUsageError,
    formatCliError,
    handleCliError
} from "./cli/cli-errors.js";
import { normalizeStringList } from "./src/options/option-utils.js";

const wrapperDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(wrapperDirectory, "src", "gml.js");
const ignorePath = path.resolve(wrapperDirectory, ".prettierignore");

const FALLBACK_EXTENSIONS = Object.freeze([".gml"]);

const ParseErrorAction = Object.freeze({
    REVERT: "revert",
    SKIP: "skip",
    ABORT: "abort"
});

const VALID_PARSE_ERROR_ACTIONS = new Set(Object.values(ParseErrorAction));

function normalizeParseErrorAction(value, fallbackValue) {
    if (value == null) {
        return fallbackValue;
    }

    const normalized = String(value).trim().toLowerCase();

    if (normalized.length === 0) {
        return fallbackValue;
    }

    if (VALID_PARSE_ERROR_ACTIONS.has(normalized)) {
        return normalized;
    }

    return null;
}

function normalizeExtensions(
    rawExtensions,
    fallbackExtensions = FALLBACK_EXTENSIONS
) {
    if (!rawExtensions) {
        return fallbackExtensions;
    }

    const candidateValues = normalizeStringList(rawExtensions, {
        splitPattern: /,/,
        allowInvalidType: true
    });

    if (candidateValues.length === 0) {
        return fallbackExtensions;
    }

    const normalized = candidateValues
        .map((extension) => {
            let lowerCaseExtension = extension.toLowerCase();

            // Drop any directory/glob prefixes (e.g. **/*.gml or src/**/*.yy).
            lowerCaseExtension = lowerCaseExtension.replace(/.*[\\/]/, "");

            // Trim leading wildcard tokens like * or ? that commonly appear in glob patterns.
            lowerCaseExtension = lowerCaseExtension.replace(/^[*?]+/, "");

            if (!lowerCaseExtension) {
                return null;
            }

            return lowerCaseExtension.startsWith(".")
                ? lowerCaseExtension
                : `.${lowerCaseExtension}`;
        })
        .filter(Boolean);

    if (normalized.length === 0) {
        return fallbackExtensions;
    }

    return [...new Set(normalized)];
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

const [, , ...cliArgs] = process.argv;

const USAGE = [
    "Usage: node src/plugin/prettier-wrapper.js [options] <path>",
    "",
    "Options:",
    "  --path <path>             Directory or file to format (alias for positional).",
    "  --extensions <list>       Comma-separated list of file extensions to format.",
    "  --on-parse-error <mode>   How to handle parser failures: revert, skip, or abort."
].join("\n");

function parseCliArguments(args) {
    const parsed = {
        targetPathInput: null,
        extensions: DEFAULT_EXTENSIONS,
        onParseError: DEFAULT_PARSE_ERROR_ACTION
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (!arg.startsWith("--")) {
            if (!parsed.targetPathInput) {
                parsed.targetPathInput = arg;
            }
            continue;
        }

        const [flag, inlineValue] = arg.split("=", 2);
        const consumeValue = () => {
            if (inlineValue !== undefined) {
                return inlineValue;
            }

            if (index + 1 < args.length) {
                index += 1;
                return args[index];
            }

            return undefined;
        };

        if (flag === "--path") {
            const value = consumeValue();
            if (value === undefined) {
                throw new CliUsageError("--path requires a value.", {
                    usage: USAGE
                });
            }
            parsed.targetPathInput = value;
            continue;
        }

        if (flag === "--extensions") {
            const value = consumeValue();
            if (value === undefined) {
                throw new CliUsageError("--extensions requires a value.", {
                    usage: USAGE
                });
            }
            parsed.extensions = normalizeExtensions(value, DEFAULT_EXTENSIONS);
            continue;
        }

        if (flag === "--on-parse-error") {
            const value = consumeValue();
            if (value === undefined) {
                throw new CliUsageError("--on-parse-error requires a value.", {
                    usage: USAGE
                });
            }
            const normalized = normalizeParseErrorAction(
                value,
                DEFAULT_PARSE_ERROR_ACTION
            );
            if (!normalized) {
                throw new CliUsageError(
                    `--on-parse-error must be one of: ${[
                        ...VALID_PARSE_ERROR_ACTIONS
                    ]
                        .sort()
                        .join(", ")}.`,
                    { usage: USAGE }
                );
            }
            parsed.onParseError = normalized;
        }
    }

    return parsed;
}

let targetExtensions = DEFAULT_EXTENSIONS;
let targetExtensionSet = new Set(
    targetExtensions.map((extension) => extension.toLowerCase())
);
let placeholderExtension = targetExtensions[0] ?? DEFAULT_EXTENSIONS[0];

function shouldFormatFile(filePath) {
    const fileExtension = path.extname(filePath).toLowerCase();
    return targetExtensionSet.has(fileExtension);
}

/**
 * Prettier configuration shared by all formatted GameMaker Language files.
 */
const options = {
    parser: "gml-parse",
    plugins: [pluginPath],
    loglevel: "warn",
    ignorePath,
    noErrorOnUnmatchedPattern: true
};

let skippedFileCount = 0;
let baseProjectIgnorePaths = [];
const baseProjectIgnorePathSet = new Set();
let encounteredFormattingError = false;
let ignoreRulesContainNegations = false;
const registeredIgnorePaths = new Set();
let parseErrorAction = DEFAULT_PARSE_ERROR_ACTION;
let abortRequested = false;
let revertTriggered = false;
const formattedFileOriginalContents = new Map();

function recordFormattedFileOriginalContents(filePath, contents) {
    if (!formattedFileOriginalContents.has(filePath)) {
        formattedFileOriginalContents.set(filePath, contents);
    }
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

    for (const [filePath, originalContents] of revertEntries) {
        try {
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
        }
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
        if (!ignoreFilePath || registeredIgnorePaths.has(ignoreFilePath)) {
            continue;
        }

        registeredIgnorePaths.add(ignoreFilePath);

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
        ignorePath,
        ...baseProjectIgnorePaths,
        ...additionalIgnorePaths
    ].filter(Boolean);
    if (ignoreCandidates.length === 0) {
        return null;
    }

    const uniqueIgnorePaths = [...new Set(ignoreCandidates)];
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

function isPathInside(child, parent) {
    if (!child || !parent) {
        return false;
    }

    const relative = path.relative(parent, child);
    if (!relative) {
        return true;
    }

    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveProjectIgnorePaths(directory) {
    const directoriesToInspect = [];
    const seenDirectories = new Set();

    const collectDirectories = (startingDirectory) => {
        if (!startingDirectory) {
            return;
        }

        let currentDirectory = path.resolve(startingDirectory);

        while (!seenDirectories.has(currentDirectory)) {
            seenDirectories.add(currentDirectory);
            directoriesToInspect.push(currentDirectory);

            const parentDirectory = path.dirname(currentDirectory);
            if (parentDirectory === currentDirectory) {
                break;
            }

            currentDirectory = parentDirectory;
        }
    };

    const resolvedDirectory = path.resolve(directory);
    collectDirectories(resolvedDirectory);

    const workingDirectory = process.cwd();
    if (isPathInside(path.resolve(workingDirectory), resolvedDirectory)) {
        collectDirectories(workingDirectory);
    }

    const ignoreFiles = [];

    for (const candidateDirectory of directoriesToInspect) {
        const ignoreCandidate = path.join(
            candidateDirectory,
            ".prettierignore"
        );

        try {
            const candidateStats = await stat(ignoreCandidate);

            if (candidateStats.isFile()) {
                ignoreFiles.push(ignoreCandidate);
            }
        } catch {
            // Ignore missing files.
        }
    }

    return ignoreFiles;
}

async function resolveTargetStats(target) {
    try {
        return await stat(target);
    } catch (error) {
        throw new Error(`Unable to access ${target}: ${error.message}`, {
            cause: error
        });
    }
}

async function processDirectory(directory, inheritedIgnorePaths = []) {
    if (abortRequested) {
        return;
    }
    let currentIgnorePaths = inheritedIgnorePaths;
    const localIgnorePath = path.join(directory, ".prettierignore");
    let shouldRegisterLocalIgnore =
        baseProjectIgnorePathSet.has(localIgnorePath);

    try {
        const ignoreStats = await stat(localIgnorePath);

        if (ignoreStats.isFile()) {
            shouldRegisterLocalIgnore = true;

            if (!inheritedIgnorePaths.includes(localIgnorePath)) {
                currentIgnorePaths = [...inheritedIgnorePaths, localIgnorePath];
            }
        }
    } catch {
        // Ignore missing files.
    }

    if (shouldRegisterLocalIgnore) {
        await registerIgnorePaths([localIgnorePath]);
    }

    const files = await readdir(directory);
    for (const file of files) {
        if (abortRequested) {
            return;
        }
        const filePath = path.join(directory, file);
        const stats = await lstat(filePath);

        if (stats.isSymbolicLink()) {
            console.log(`Skipping ${filePath} (symbolic link)`);
            skippedFileCount += 1;
            continue;
        }

        if (stats.isDirectory()) {
            if (await shouldSkipDirectory(filePath, currentIgnorePaths)) {
                continue;
            }
            await processDirectory(filePath, currentIgnorePaths);
            if (abortRequested) {
                return;
            }
        } else if (shouldFormatFile(filePath)) {
            await processFile(filePath, currentIgnorePaths);
            if (abortRequested) {
                return;
            }
        } else {
            skippedFileCount += 1;
        }
    }
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
        ...(resolvedConfig ?? {}),
        filepath: filePath
    };

    const basePlugins = asArray(options.plugins);
    const resolvedPlugins = asArray(resolvedConfig?.plugins);
    const combinedPlugins = [...new Set([...basePlugins, ...resolvedPlugins])];

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

        recordFormattedFileOriginalContents(filePath, data);
        await writeFile(filePath, formatted);
        console.log(`Formatted ${filePath}`);
    } catch (err) {
        await handleFormattingError(err, filePath);
    }
}

async function run() {
    const {
        targetPathInput,
        extensions: configuredExtensions,
        onParseError
    } = parseCliArguments(cliArgs);

    if (!targetPathInput) {
        throw new CliUsageError(
            "No target project provided. Pass a directory path as the first argument or use --path=/absolute/to/project.",
            { usage: USAGE }
        );
    }

    const targetPath = path.resolve(process.cwd(), targetPathInput);
    targetExtensions =
        configuredExtensions.length > 0
            ? configuredExtensions
            : DEFAULT_EXTENSIONS;
    targetExtensionSet = new Set(
        targetExtensions.map((extension) => extension.toLowerCase())
    );
    placeholderExtension = targetExtensions[0] ?? DEFAULT_EXTENSIONS[0];
    parseErrorAction = onParseError;
    abortRequested = false;
    revertTriggered = false;
    formattedFileOriginalContents.clear();
    skippedFileCount = 0;
    encounteredFormattingError = false;

    const targetStats = await resolveTargetStats(targetPath);
    const targetIsDirectory = targetStats.isDirectory();

    if (!targetIsDirectory && !targetStats.isFile()) {
        throw new CliUsageError(
            `${targetPath} is not a file or directory that can be formatted`,
            { usage: USAGE }
        );
    }

    const projectRoot = targetIsDirectory
        ? targetPath
        : path.dirname(targetPath);

    baseProjectIgnorePaths = await resolveProjectIgnorePaths(projectRoot);
    baseProjectIgnorePathSet.clear();
    for (const projectIgnorePath of baseProjectIgnorePaths) {
        baseProjectIgnorePathSet.add(projectIgnorePath);
    }
    await registerIgnorePaths([ignorePath, ...baseProjectIgnorePaths]);
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
}

run().catch((error) => {
    handleCliError(error, {
        prefix: "Failed to format project.",
        exitCode: 1
    });
});
