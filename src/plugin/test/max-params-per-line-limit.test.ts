import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("enforces the maxParamsPerLine limit even when inline would fit", async () => {
    const source = ["call(a, b, c, d, e);", ""].join("\n");

    const formatted = await Plugin.format(source, { maxParamsPerLine: 3 });
    const trimmed = formatted.trim();

    assert.strictEqual(
        trimmed,
        ["call(", "    a, b, c,", "    d, e", ");"].join("\n"),
        "Expected the formatter to break after the third argument when maxParamsPerLine is reached."
    );
});
