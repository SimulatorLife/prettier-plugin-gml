import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("keeps small struct arguments inline", async () => {
    const source = [
        "function create() {",
        "    return instance_create_depth(0, 0, 0, Object2, {",
        "        value: 99,",
        "        func: function() {",
        "            return self.value;",
        "        }",
        "    });",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[2],
        "    return instance_create_depth(0, 0, 0, Object2, {",
        "Struct arguments with two properties should stay inline with the call signature."
    );
});

void test("still breaks struct arguments with many properties", async () => {
    const source = [
        "function build() {",
        "    return create_instance(1, 2, {",
        "        first: 1,",
        "        second: 2,",
        "        third: 3",
        "    });",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[2],
        "    return create_instance(",
        "Calls with larger struct arguments should still break to preserve readability."
    );
    assert.strictEqual(
        lines[3],
        "        1,",
        "The first argument should be printed on its own line when the call breaks."
    );
});
