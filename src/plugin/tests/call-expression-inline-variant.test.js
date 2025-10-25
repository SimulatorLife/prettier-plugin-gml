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

test("keeps simple leading arguments inline when callbacks follow", async () => {
    const source = [
        "call(1,2,3, someFunctionCallWithBigArgumentsAndACallback, function(aaaaaaaaaaaaaaaaaa){foo()})",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[0],
        "call(1, 2, 3, someFunctionCallWithBigArgumentsAndACallback, function(aaaaaaaaaaaaaaaaaa) {",
        "Expected leading simple arguments to remain inline when trailing callbacks do not force a wrap."
    );
});
