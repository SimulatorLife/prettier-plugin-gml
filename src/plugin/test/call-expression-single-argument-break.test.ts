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
        path.resolve(currentDirectory, "../src/gml.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

async function formatWithPlugin(source, overrides: any = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        maxParamsPerLine: 3
    });
}

test("wraps single call expression arguments when enforcing maxParamsPerLine", async () => {
    const source = [
        "buffer_from_vertex_buffer(vertex_buffer_create_triangular_prism(undefined, undefined, false));",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.strictEqual(
        trimmed,
        [
            "buffer_from_vertex_buffer(",
            "    vertex_buffer_create_triangular_prism(undefined, undefined, false)",
            ");"
        ].join("\n"),
        "Expected nested call arguments to wrap even when only a single parameter is provided."
    );
});
