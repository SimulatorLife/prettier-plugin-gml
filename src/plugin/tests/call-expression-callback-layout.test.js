import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });
}

test("keeps simple arguments and trailing callback inline when the call fits the print width", async () => {
    const source = [
        "call(",
        "    1,",
        "    2,",
        "    3,",
        "    someFunctionCallWithBigArgumentsAndACallback,",
        "    function(aaaaaaaaaaaaaaaaaa) {",
        "        foo();",
        "    }",
        ");",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[0],
        "call(1, 2, 3, someFunctionCallWithBigArgumentsAndACallback, function(aaaaaaaaaaaaaaaaaa) {",
        "Expected leading simple arguments and the callback to remain inline when they fit within the default print width."
    );
});

test("wraps the trailing callback when the configured print width is exceeded", async () => {
    const source = [
        "call(",
        "    1,",
        "    2,",
        "    3,",
        "    someFunctionCallWithBigArgumentsAndACallback,",
        "    function(aaaaaaaaaaaaaaaaaa) {",
        "        foo();",
        "    }",
        ");",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source, { printWidth: 60 });
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[0],
        "call(1, 2, 3, someFunctionCallWithBigArgumentsAndACallback,",
        "Expected long calls to wrap before the callback when the configured print width is smaller."
    );
    assert.strictEqual(
        lines[1],
        "    function(aaaaaaaaaaaaaaaaaa) {",
        "Expected the callback to move to the following line when the call wraps."
    );
});
