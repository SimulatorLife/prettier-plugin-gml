// prettier-wrapper.js
import prettier from "prettier";
import path from "path";
import process from "process";
import fs from "fs";
import util from "util";

const targetPath = process.argv[2]; // Reads the target path from the command line argument
const pluginPath = path.resolve(process.cwd(), path.join("src", "gml.js")); // Gets the absolute path of the plugin
const ignorePath = path.resolve(process.cwd(), ".prettierignore"); // Gets the absolute path of the ignore file. This seems to be broken though...

const options = {
    parser: "gml-parse", // You can adjust this based on your needs
    plugins: [pluginPath],
    loglevel: "warn",
    ignorePath: ignorePath,
    noErrorOnUnmatchedPattern: true
};

// Converts callback-based functions to promise-based functions
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
        // Read the file
        const data = await readFile(filePath, "utf8");

        // Format the file content
        const formatted = await prettier.format(data, options);

        // Write the formatted content back to the file
        await writeFile(filePath, formatted);

        console.log(`Formatted ${filePath}`);
    } catch (err) {
        console.error(err);
    }
}

await processDirectory(targetPath);
console.debug(`Skipped ${numSkippedFiles} files`);