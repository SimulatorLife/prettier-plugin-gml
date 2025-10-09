import prettier from "prettier";
import path from "path";
import process from "process";
import fs from "fs";
import util from "util";
import { fileURLToPath } from "url";

const wrapperDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(wrapperDirectory, "src", "gml.js");
const ignorePath = path.resolve(wrapperDirectory, ".prettierignore");

const [, , ...cliArgs] = process.argv;

function resolveTargetPath(args) {
    if (args.length === 0) {
        return null;
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (!arg.startsWith("--")) {
            return arg;
        }

        if (arg === "--path" && index + 1 < args.length) {
            return args[index + 1];
        }

        if (arg.startsWith("--path=")) {
            return arg.slice("--path=".length);
        }
    }

    return null;
}

const targetPathInput = resolveTargetPath(cliArgs);

if (!targetPathInput) {
    console.error(
        "No target project provided. Pass a directory path as the first argument or use --path=/absolute/to/project"
    );
    process.exit(1);
}

const targetPath = path.resolve(process.cwd(), targetPathInput);

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

let skippedFileCount = 0;
let projectIgnorePath = null;

function getIgnorePathOptions() {
    const ignoreCandidates = [ignorePath, projectIgnorePath].filter(Boolean);
    if (ignoreCandidates.length === 0) {
        return null;
    }

    const uniqueIgnorePaths = [...new Set(ignoreCandidates)];
    return uniqueIgnorePaths.length === 1 ? uniqueIgnorePaths[0] : uniqueIgnorePaths;
}

async function shouldSkipDirectory(directory) {
    const ignorePathOption = getIgnorePathOptions();
    if (!ignorePathOption) {
        return false;
    }

    const placeholderPath = path.join(directory, "__prettier_plugin_gml_ignore_test__.gml");

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

async function resolveProjectIgnorePath(directory) {
    const candidate = path.join(directory, ".prettierignore");

    try {
        const candidateStats = await stat(candidate);

        if (candidateStats.isFile()) {
            return candidate;
        }
    } catch {
        // Ignore missing files.
    }

    return null;
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
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
            if (await shouldSkipDirectory(filePath)) {
                continue;
            }
            await processDirectory(filePath);
        } else if (path.extname(filePath).toLowerCase() === ".gml") {
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

    if (!mergedOptions.parser) {
        mergedOptions.parser = options.parser;
    }

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
        console.error(err);
    }
}

await ensureDirectoryExists(targetPath);
projectIgnorePath = await resolveProjectIgnorePath(targetPath);
await processDirectory(targetPath);
console.debug(`Skipped ${skippedFileCount} files`);
