import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("flatten synthetic addition parentheses from reordered optional parameters", async () => {
    const source = [
        "function example(a, b = 1, c, d = 2) {",
        "    return a + b + c + d;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const expectedLines = [
        "/// @function example",
        "/// @param a",
        "/// @param c",
        "/// @param [b=1]",
        "/// @param [d=2]",
        "function example(a, c, b = 1, d = 2) {",
        "    return a + b + c + d;",
        "}"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines,
        "Expected flattened addition without extra parentheses."
    );
});
