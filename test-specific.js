import path from "node:path";
import prettier from "prettier";

const pluginPath = path.resolve(process.cwd(), "src/plugin/src/gml.js");

async function testSpecificCase() {
    // This is the exact test case that's failing
    const source = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}",
        ""
    ].join("\n");

    console.log("INPUT:");
    console.log(source);
    console.log("\n---\n");

    try {
        const formatted = await prettier.format(source, {
            parser: "gml-parse",
            plugins: [pluginPath]
        });

        console.log("OUTPUT:");
        console.log(formatted);

        if (formatted.includes("/// @description")) {
            console.log("\n✓ SUCCESS: Found @description in output!");
        } else {
            console.log("\n✗ FAILURE: Did NOT find @description in output");
        }

        // Check if the specific line exists
        const lines = formatted.split("\n");
        const descLine = lines.find((l) => l.includes("@description"));
        if (descLine) {
            console.log(`\nFound description line: "${descLine}"`);
        } else {
            console.log("\nNo @description line found");
        }
    } catch (error) {
        console.error("ERROR:", error.message);
    }
}

testSpecificCase().catch(console.error);
