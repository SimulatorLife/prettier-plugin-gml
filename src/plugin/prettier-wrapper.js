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
            await processDirectory(filePath);
        } else if (path.extname(filePath) === ".gml") {
            await processFile(filePath);
        } else {
            skippedFileCount += 1;
        }
    }
}

async function processFile(filePath) {
    try {
        const data = await readFile(filePath, "utf8");
        const formatted = await prettier.format(data, options);
        await writeFile(filePath, formatted);
        console.log(`Formatted ${filePath}`);
    } catch (err) {
        console.error(err);
    }
}

await ensureDirectoryExists(targetPath);
await processDirectory(targetPath);
console.debug(`Skipped ${skippedFileCount} files`);
