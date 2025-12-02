import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("adds a blank line before closing blocks after nested functions", async () => {
    const source = [
        "function outer() constructor {",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.ok(
        trimmed.includes("    }\n\n}"),
        "Expected a blank line between the nested function and the enclosing block's closing brace."
    );
});
