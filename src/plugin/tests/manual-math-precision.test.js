import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("converts manual mean with floating point noise", async () => {
    const source = [
        "function convert_mean(a, b) {",
        "    return (a + b) * 0.5000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_mean",
            "/// @param a",
            "/// @param b",
            "function convert_mean(a, b) {",
            "    return mean(a, b);",
            "}",
            ""
        ].join("\n")
    );
});
