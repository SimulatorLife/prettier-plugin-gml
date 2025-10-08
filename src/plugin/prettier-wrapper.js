import prettier from "prettier";
import path from "path";
import process from "process";
import fs from "fs";
import util from "util";

const targetPath = process.argv[2];
const pluginPath = path.resolve(process.cwd(), path.join("src", "gml.js"));
const ignorePath = path.resolve(process.cwd(), ".prettierignore");

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

var numSkippedFiles = 0;

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
            numSkippedFiles++;
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

await processDirectory(targetPath);
console.debug(`Skipped ${numSkippedFiles} files`);
