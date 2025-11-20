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

test("emits a separating blank line after documented nested functions", async () => {
    const source = [
        "function Outer() constructor {",
        "    /// @function inner",
        "    /// @returns {undefined}",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trimEnd().split("\n");
    const closingLines = lines.slice(-3);

    assert.deepEqual(
        closingLines,
        ["    }", "", "}"],
        "Expected documented nested functions to be separated from their enclosing block's closing brace with a blank line."
    );
});
