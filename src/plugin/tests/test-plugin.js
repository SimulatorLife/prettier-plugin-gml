// testRunner.js

import * as prettier from "prettier";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const testsDirectory = path.join(currentDirectory, ".");
const fileEncoding = "utf8";
const fileExt = ".gml";

async function getFilesWithExtension(directory, extension) {
    const files = await fs.promises.readdir(directory);
    return files.filter(file => file.endsWith(extension));
}

async function testFiles() {
    const inputFiles = await getFilesWithExtension(testsDirectory, ".input" + fileExt);

    if (inputFiles.length <= 0) {
        console.error(`No input files found in directory ${testsDirectory}`);
        process.exit(1);
    }

    for (let inputFile of inputFiles) {
        const baseName = inputFile.slice(0, -4); // remove '.gml' extension
        const outputFile = baseName.replace(".input", ".output") + fileExt;

        const inputCode = await fs.promises.readFile(path.join(testsDirectory, inputFile), fileEncoding);
        if (typeof inputCode !== "string") {
            console.error(`Unexpected type for input code. Expected string but got ${typeof inputCode}`);
            process.exit(1);
        }

        var expectedOutput = await fs.promises.readFile(path.join(testsDirectory, outputFile), fileEncoding);
        if (typeof expectedOutput !== "string") {
            console.error(`Unexpected type for expected output. Expected string but got ${typeof expectedOutput}`);
            process.exit(1);
        }

        var formatted = await prettier.format(inputCode, {
            plugins: [path.join(currentDirectory, "../src/gml.js")],
            parser: "gml-parse"
        });

        if (typeof formatted !== "string") {
            console.error(`Unexpected type for formatted code. Expected string but got ${typeof formatted}`);
            process.exit(1);
        } else if (formatted.trim() === "") {
            console.error("Unexpected empty string for formatted code.");
            process.exit(1);
        }

        formatted = formatted.trim();
        expectedOutput = expectedOutput.trim();

        if (formatted !== expectedOutput) {
            var isAnyLineDiff = false;

            const formattedLines = formatted.split("\n");
            const expectedLines = expectedOutput.split("\n");

            for (let i = 0; i < Math.max(formattedLines.length, expectedLines.length); i++) {
                var expectedLine = expectedLines[i];
                var formattedLine = formattedLines[i];
                const lineNum = i + 1;

                if (expectedLine === undefined) {
                    console.error(`\tExpected line ${lineNum} does not exist`);
                } else {
                    expectedLine = expectedLine.trim();
                }
      
                if (formattedLine === undefined) {
                    console.error("\tReceived line does not exist");
                } else {
                    formattedLine = formattedLine.trim();
                }
        
                if (formattedLine !== expectedLine) {
                    isAnyLineDiff = true;
                    console.error(`\tLine ${lineNum} does not match:`);
                    console.error(`\tExpected: ${expectedLine}`);
                    console.error(`\tReceived: ${formattedLine}`);
                }
            }

            if (isAnyLineDiff) {
                console.error(`\nTest failed for file '${inputFile}'`);
                console.log(`\nFull formatted code for file '${inputFile}':\n\n`, formatted);
                process.exit(1); // Exit with a failure code
            }
        }
        console.log(`Test for file '${inputFile}' passed!`);
    }

    console.log(`All ${inputFiles.length} tests passed!`);
    process.exit(0); // Exit with a success code
}

testFiles();