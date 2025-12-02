import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("adds padding after trailing function declarations in blocks", async () => {
    const source = [
        "function outer() {",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    const trailingLines = lines.slice(-3);

    assert.deepEqual(
        trailingLines,
        ["    }", "", "}"],
        "Expected the formatter to retain a blank line after trailing function declarations within blocks."
    );
});
