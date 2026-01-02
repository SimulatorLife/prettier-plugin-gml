import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("preserves blank line after condensing argument_count fallbacks", async () => {
    const source = [
        "function demo(value) {",
        "    var setting = true;",
        "    if (argument_count > 1) setting = argument[1];",
        "",
        "    var nextValue = value + 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    const nextValueIndex = lines.findIndex((line) =>
        line.includes("var nextValue")
    );

    assert.notStrictEqual(
        nextValueIndex,
        -1,
        "Expected the formatted output to still contain the following statement."
    );

    assert.strictEqual(
        lines[nextValueIndex - 1],
        "",
        "Expected a blank line to separate the condensed default parameter handling from the following logic."
    );
});
