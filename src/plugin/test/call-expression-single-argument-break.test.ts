import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("keeps a single nested call argument inline when it fits", async () => {
    const source = [
        "buffer_from_vertex_buffer(vertex_buffer_create_triangular_prism(undefined, undefined, false));",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.strictEqual(
        formatted,
        "buffer_from_vertex_buffer(vertex_buffer_create_triangular_prism(undefined, undefined, false));\n",
        "Expected default formatting to rely on print width instead of forced argument-count wrapping."
    );
});
