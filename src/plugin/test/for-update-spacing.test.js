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

test("preserves compact augmented assignment spacing in for loop updates", async () => {
    const source = [
        "for (var i = 0; i <= 1; i+= step_size) {",
        "    foo();",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        [
            "for (var i = 0; i <= 1; i+= step_size) {",
            "    foo();",
            "}",
            ""
        ].join("\n")
    );
});
