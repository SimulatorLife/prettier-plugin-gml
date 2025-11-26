import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

test("omits blank lines between nested and enclosing block braces", async () => {
    const source = [
        "function demo() {",
        "    while (true) {",
        "        break;",
        "    }",
        "",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    const closingBracePair = lines.slice(-2);

    assert.deepEqual(
        closingBracePair,
        ["    }", "}"],
        "Expected the formatter to collapse extraneous blank lines between adjacent closing braces."
    );
});

test("adds a blank line after nested function declarations", async () => {
    const source = [
        "function outer() constructor {",
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
        "Expected the formatter to preserve a separating blank line before closing the outer block."
    );
});
