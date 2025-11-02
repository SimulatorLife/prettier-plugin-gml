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

test("collapses literal factors surrounding a single operand", async () => {
    const source = ["var value = 1.3 * size * 0.12 / 1.5;", ""].join("\n");

    const formatted = await format(source);

    assert.strictEqual(formatted, ["var value = size * 0.104;", ""].join("\n"));
});
