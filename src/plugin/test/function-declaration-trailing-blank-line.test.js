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

test("adds padding after trailing function declarations in blocks", async () => {
    const source = [
        "function outer() {",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    const trailingLines = lines.slice(-3);

    assert.deepEqual(
        trailingLines,
        ["    }", "", "}"],
        "Expected the formatter to retain a blank line after trailing function declarations within blocks."
    );
});
