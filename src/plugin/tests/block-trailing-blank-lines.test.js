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

test("omits blank lines between nested and enclosing block braces", async () => {
    const source = [
        "function demo() {",
        "    while (true) {",
        "        break;",
        "    }",
        "",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    const closingBracePair = lines.slice(-2);

    assert.deepEqual(
        closingBracePair,
        ["    }", "}"],
        "Expected the formatter to collapse extraneous blank lines between adjacent closing braces."
    );
});

test("preserves blank lines before closing braces when the preceding statement emits a semicolon", async () => {
    const source = [
        "function demo() {",
        "    value = 1;",
        "",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    const closingSegment = lines.slice(-3);

    assert.deepEqual(
        closingSegment,
        ["    value = 1;", "", "}"],
        "Expected blank lines between statements with semicolons and the enclosing block brace to be preserved."
    );
});
