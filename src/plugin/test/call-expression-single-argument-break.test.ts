import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

void test("wraps single call expression arguments when enforcing maxParamsPerLine", async () => {
    const source = [
        "buffer_from_vertex_buffer(vertex_buffer_create_triangular_prism(undefined, undefined, false));",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { maxParamsPerLine: 3 });

    assert.strictEqual(
        formatted,
        `${[
            "buffer_from_vertex_buffer(",
            "    vertex_buffer_create_triangular_prism(undefined, undefined, false)",
            ");"
        ].join("\n")}\n`,
        "Expected nested call arguments to wrap even when only a single parameter is provided."
    );
});
