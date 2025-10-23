import prettier from "prettier";
import fs from "node:fs/promises";

const pluginPath = "./src/plugin/src/gml.js";
const inputPath = "./src/plugin/tests/testStructs.input.gml";
const outputPath = "./src/plugin/tests/testStructs.output.gml";

const input = await fs.readFile(inputPath, "utf8");
const expected = await fs.readFile(outputPath, "utf8");

const formatted = await prettier.format(input, {
    plugins: [pluginPath],
    parser: "gml-parse"
});

const formattedLines = formatted.trim().split("\n");
const expectedLines = expected.trim().split("\n");

console.log("Formatted lines:", formattedLines.length);
console.log("Expected lines:", expectedLines.length);

// Find first difference
for (
    let i = 0;
    i < Math.max(formattedLines.length, expectedLines.length);
    i++
) {
    if (formattedLines[i] !== expectedLines[i]) {
        console.log(`\nFirst difference at line ${i + 1}:`);
        console.log("Formatted:", JSON.stringify(formattedLines[i]));
        console.log("Expected:", JSON.stringify(expectedLines[i]));

        console.log("\nContext (formatted):");
        for (
            let j = Math.max(0, i - 2);
            j < Math.min(formattedLines.length, i + 3);
            j++
        ) {
            console.log(`${j + 1}: ${formattedLines[j]}`);
        }

        console.log("\nContext (expected):");
        for (
            let j = Math.max(0, i - 2);
            j < Math.min(expectedLines.length, i + 3);
            j++
        ) {
            console.log(`${j + 1}: ${expectedLines[j]}`);
        }
        break;
    }
}
