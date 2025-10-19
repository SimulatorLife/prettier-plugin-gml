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

const SOURCE = [
    "function example(a, b = 1, c, d = 2) {",
    "    return 1;",
    "}",
    ""
].join("\n");

const EXPECTED_FORMATTED = [
    "",
    "/// @function example",
    "/// @param a",
    "/// @param [b=1]",
    "/// @param [c]",
    "/// @param [d=2]",
    "function example(a, b = 1, c = undefined, d = 2) {",
    "    return 1;",
    "}",
    ""
].join("\n");

test("adds undefined defaults for trailing optional parameters", async () => {
    const formatted = await format(SOURCE);

    assert.strictEqual(formatted, EXPECTED_FORMATTED);
});

test("adds undefined defaults when Feather fixes are enabled", async () => {
    const formatted = await format(SOURCE, { applyFeatherFixes: true });

    assert.strictEqual(formatted, EXPECTED_FORMATTED);
});
