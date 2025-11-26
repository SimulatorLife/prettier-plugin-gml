import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../dist/src/index.js"),
        path.resolve(currentDirectory, "../dist/index.js"),
        path.resolve(currentDirectory, "../src/index.ts"),
        path.resolve(currentDirectory, "../src/plugin-entry.ts"),
        path.resolve(currentDirectory, "../src/index.js"),
        path.resolve(currentDirectory, "../src/plugin-entry.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

async function format(source, options = {}) {
    return Plugin.format(source, {
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
