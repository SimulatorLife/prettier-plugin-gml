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
