import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("converts division by two with inline comments into multiplication by one half", async () => {
    const source = [
        "function halve(value) {",
        "    return value / /* keep important comment */ 2;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {optimizeMathExpressions: true});

    assert.ok(
        formatted.includes(
            "    return value * /* keep important comment */ 0.5;"
        ),
        "Expected the formatter to preserve the inline comment when converting division to multiplication."
    );

    assert.ok(
        !formatted.includes(
            "    return value / /* keep important comment */ 2;"
        ),
        "Expected the formatter to replace division by two with multiplication by one half."
    );
});
