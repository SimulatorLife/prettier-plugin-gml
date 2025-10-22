import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("preserves manual parameter names when arguments are referenced by index", async () => {
    const source = [
        "/// @param firstValue",
        "/// @param secondValue",
        "function example(argument0, argument1) {",
        "    var firstValue = argument0;",
        "    return argument1;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expected = [
        "/// @function example",
        "/// @param firstValue",
        "/// @param secondValue",
        "function example(argument0, argument1) {",
        "    var firstValue = argument0;",
        "    return argument1;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted,
        expected,
        "Expected formatter to keep existing parameter documentation names without inserting argument indices."
    );
});
