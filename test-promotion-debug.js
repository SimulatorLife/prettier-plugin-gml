// Direct test of promotion function behavior in context

import path from "node:path";
import prettier from "prettier";

const pluginPath = path.resolve("./src/plugin/src/gml.js");

async function testPromotionDirectly() {
    // Test the specific case from failing test
    const sourceCode = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}"
    ].join("\n");

    console.log("SOURCE INPUT:");
    console.log(sourceCode);
    console.log("\n---\n");

    try {
        const formatted = await prettier.format(sourceCode, {
            parser: "gml-parse",
            plugins: [pluginPath]
        });

        console.log("FORMATTED OUTPUT:");
        console.log(formatted);

        // Check for @description
        const hasDesc = formatted.includes("@description");
        console.log("\nContains '@description':", hasDesc);

        if (hasDesc) {
            const descLines = formatted
                .split("\n")
                .filter((line) => line.includes("@description"));
            console.log("Description lines found:", descLines);
        }

        // Check for unpromoted comments
        const unpromoted = formatted.includes("// / ");
        console.log("Still has unpromoted '// / ':", unpromoted);

        if (!hasDesc) {
            console.log("*** TEST WILL FAIL - No @description promotion ***");
        }
    } catch (error) {
        console.error("Error:", error.message);
        if (error.location) {
            console.error("Location:", error.location);
        }
    }
}

// Also test the other failing case
async function testNormalizationDirectly() {
    console.log("\n\n=== Testing @func to @function normalization ===");

    const sourceCode = [
        "function someFunc() {",
        "    // @func freeze()",
        "    // Additional comment",
        "    return 0;",
        "}"
    ].join("\n");

    console.log("SOURCE INPUT:");
    console.log(sourceCode);
    console.log("\n---\n");

    try {
        const formatted = await prettier.format(sourceCode, {
            parser: "gml-parse",
            plugins: [pluginPath]
        });

        console.log("FORMATTED OUTPUT:");
        console.log(formatted);

        const hasTripleSlash = formatted.includes("/// @function");
        const hasSingleAtFunc = formatted.includes("// @func");
        console.log("\nHas '/// @function':", hasTripleSlash);
        console.log("Still has '// @func':", hasSingleAtFunc);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

async function main() {
    console.log("Testing comment promotion...");
    await testPromotionDirectly();
    await testNormalizationDirectly();
}

main().catch(console.error);
