import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("omits blank lines between nested and enclosing block braces", async () => {
    const source = ["function demo() {", "    while (true) {", "        break;", "    }", "", "", "}", ""].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    const closingBracePair = lines.slice(-2);

    assert.deepEqual(
        closingBracePair,
        ["    }", "}"],
        "Expected the formatter to collapse extraneous blank lines between adjacent closing braces."
    );
});

void test("omits trailing blank lines after nested function declarations", async () => {
    const source = [
        "function outer() constructor {",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.notEqual(lines.at(-2), "", "Expected the formatter to omit a blank line before the enclosing block closes.");
});
