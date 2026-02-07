import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("keeps simple multi-argument calls inline when they fit the print width", async () => {
    const source = ["call(a, b, c, d, e);", ""].join("\n");

    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.strictEqual(
        trimmed,
        "call(a, b, c, d, e);",
        "Expected formatter defaults to avoid introducing a numeric argument-count wrap threshold."
    );
});
