import prettier from "prettier";
import path from "path";
import process from "process";
import fs from "fs";
import util from "util";
import { fileURLToPath } from "url";

const wrapperDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(wrapperDirectory, "src", "gml.js");
const ignorePath = path.resolve(wrapperDirectory, ".prettierignore");

const DEFAULT_EXTENSIONS = [".gml"];

const [, , ...cliArgs] = process.argv;

function normalizeExtensions(rawExtensions) {
    if (!rawExtensions) {
        return DEFAULT_EXTENSIONS;
    }

    const candidateValues = rawExtensions
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    if (candidateValues.length === 0) {
        return DEFAULT_EXTENSIONS;
    }

    const normalized = candidateValues.map((extension) => {
        const lowerCaseExtension = extension.toLowerCase();
        return lowerCaseExtension.startsWith(".") ? lowerCaseExtension : `.${lowerCaseExtension}`;
    });

    return [...new Set(normalized)];
}

function parseCliArguments(args) {
    const parsed = {
        targetPathInput: null,
        extensions: DEFAULT_EXTENSIONS
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (!arg.startsWith("--")) {
            if (!parsed.targetPathInput) {
                parsed.targetPathInput = arg;
            }
            continue;
        }

        if (arg === "--path" && index + 1 < args.length) {
            parsed.targetPathInput = args[index + 1];
            index += 1;
            continue;
        }

        if (arg.startsWith("--path=")) {
            parsed.targetPathInput = arg.slice("--path=".length);
            continue;
        }

        if (arg === "--extensions" && index + 1 < args.length) {
            parsed.extensions = normalizeExtensions(args[index + 1]);
            index += 1;
            continue;
        }

        if (arg.startsWith("--extensions=")) {
            parsed.extensions = normalizeExtensions(arg.slice("--extensions=".length));
        }
    }

    return parsed;
}

const { targetPathInput, extensions: configuredExtensions } = parseCliArguments(cliArgs);

if (!targetPathInput) {
    console.error(
        "No target project provided. Pass a directory path as the first argument or use --path=/absolute/to/project"
    );
    process.exit(1);
}

const targetPath = path.resolve(process.cwd(), targetPathInput);
const targetExtensions = configuredExtensions.length > 0 ? configuredExtensions : DEFAULT_EXTENSIONS;
const targetExtensionSet = new Set(targetExtensions.map((extension) => extension.toLowerCase()));
const placeholderExtension = targetExtensions[0] ?? DEFAULT_EXTENSIONS[0];

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

// Promote filesystem helpers to promise-returning versions for async/await.
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const stat = util.promisify(fs.stat);
const lstat = util.promisify(fs.lstat);

let skippedFileCount = 0;
let projectIgnorePaths = [];
let encounteredFormattingError = false;
let ignoreRulesContainNegations = false;

async function detectIgnoreRuleNegations(ignoreFiles) {
    ignoreRulesContainNegations = false;

    for (const ignoreFilePath of ignoreFiles) {
        if (!ignoreFilePath) {
            continue;
        }

        try {
            const contents = await readFile(ignoreFilePath, "utf8");
            const hasNegation = contents
                .split(/\r?\n/)
                .map((line) => line.trim())
                .some((line) => line.startsWith("!") && line.length > 1);

            if (hasNegation) {
                ignoreRulesContainNegations = true;
                return;
            }
        } catch {
            // Ignore missing or unreadable files.
        }
    }
}

function getIgnorePathOptions() {
    const ignoreCandidates = [ignorePath, ...projectIgnorePaths].filter(Boolean);
    if (ignoreCandidates.length === 0) {
        return null;
    }

    const uniqueIgnorePaths = [...new Set(ignoreCandidates)];
    return uniqueIgnorePaths.length === 1 ? uniqueIgnorePaths[0] : uniqueIgnorePaths;
}

async function shouldSkipDirectory(directory) {
    if (ignoreRulesContainNegations) {
        return false;
    }

    const ignorePathOption = getIgnorePathOptions();
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
        console.warn(`Unable to evaluate ignore rules for ${directory}: ${error.message}`);
    }

    return false;
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

    collectDirectories(directory);
    collectDirectories(process.cwd());

    const ignoreFiles = [];

    for (const candidateDirectory of directoriesToInspect) {
        const ignoreCandidate = path.join(candidateDirectory, ".prettierignore");

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

async function ensureDirectoryExists(directory) {
    try {
        const directoryStats = await stat(directory);
        if (!directoryStats.isDirectory()) {
            throw new Error(`${directory} is not a directory`);
        }
    } catch (error) {
        console.error(`Unable to access ${directory}: ${error.message}`);
        process.exit(1);
    }
}

async function processDirectory(directory) {
    const files = await readdir(directory);
    for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await lstat(filePath);

        if (stats.isSymbolicLink()) {
            console.log(`Skipping ${filePath} (symbolic link)`);
            skippedFileCount += 1;
            continue;
        }

        if (stats.isDirectory()) {
            if (await shouldSkipDirectory(filePath)) {
                continue;
            }
            await processDirectory(filePath);
        } else if (shouldFormatFile(filePath)) {
            await processFile(filePath);
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
        console.warn(`Unable to resolve Prettier config for ${filePath}: ${error.message}`);
    }

    const mergedOptions = {
        ...options,
        ...(resolvedConfig ?? {}),
        filepath: filePath
    };

    const basePlugins = Array.isArray(options.plugins) ? options.plugins : [];
    const resolvedPlugins = Array.isArray(resolvedConfig?.plugins) ? resolvedConfig.plugins : [];
    const combinedPlugins = [...new Set([...basePlugins, ...resolvedPlugins])];

    if (combinedPlugins.length > 0) {
        mergedOptions.plugins = combinedPlugins;
    }

    mergedOptions.parser = options.parser;

    return mergedOptions;
}

async function processFile(filePath) {
    try {
        const formattingOptions = await resolveFormattingOptions(filePath);
        const ignorePathOption = getIgnorePathOptions();
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
        await writeFile(filePath, formatted);
        console.log(`Formatted ${filePath}`);
    } catch (err) {
        encounteredFormattingError = true;
        console.error(err);
    }
}

await ensureDirectoryExists(targetPath);
projectIgnorePaths = await resolveProjectIgnorePaths(targetPath);
await detectIgnoreRuleNegations([ignorePath, ...projectIgnorePaths]);
await processDirectory(targetPath);
console.debug(`Skipped ${skippedFileCount} files`);
if (encounteredFormattingError) {
    process.exitCode = 1;
}
