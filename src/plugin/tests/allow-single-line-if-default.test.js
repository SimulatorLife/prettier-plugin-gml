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

test("expands single-line if statements by default", async () => {
    const source = "if (global.debug) { exit; }";

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        ["if (global.debug) {", "    exit;", "}", ""].join("\n")
    );
});
