import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("preserves leading blank lines in constructor bodies", async () => {
    const source = [
        "function Example() constructor {",
        "",
        "    value = 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const expected = [
        "",
        "/// @function Example",
        "function Example() constructor {",
        "",
        "    value = 1;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted,
        expected,
        "Expected constructor bodies to retain intentional leading blank lines."
    );
});
