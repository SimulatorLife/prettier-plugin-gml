import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("preserves compact augmented assignment spacing in for loop updates", async () => {
    const source = [
        "for (var i = 0; i <= 1; i+= step_size) {",
        "    foo();",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.strictEqual(
        formatted,
        [
            "for (var i = 0; i <= 1; i += step_size) {",
            "    foo();",
            "}",
            ""
        ].join("\n")
    );
});
