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
        plugins: [pluginPath],
        maxParamsPerLine: 3
    });
}

test("enforces the maxParamsPerLine limit even when inline would fit", async () => {
    const source = ["call(a, b, c, d, e);", ""].join("\n");

    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.strictEqual(
        trimmed,
        ["call(", "    a, b, c,", "    d, e", ");"].join("\n"),
        "Expected the formatter to break after the third argument when maxParamsPerLine is reached."
    );
});
