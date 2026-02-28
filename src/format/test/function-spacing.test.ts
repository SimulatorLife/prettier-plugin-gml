import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("omits adding a blank line before closing blocks after nested functions", async () => {
    const source = [
        "function outer() constructor {",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const trimmed = formatted.trim();

    assert.notEqual(
        trimmed.includes("    }\n\n}"),
        "Unexpected blank line between nested function and enclosing block's closing brace."
    );
});

void test("omits adding a separating blank line after documented nested functions", async () => {
    const source = [
        "function Outer() constructor {",
        "    /// @returns {undefined}",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trimEnd().split("\n");
    const closingLines = lines.slice(-3);

    assert.notDeepEqual(
        closingLines,
        ["    }", "", "}"],
        "Expected documented nested functions to not add a separating blank line before their enclosing block's closing brace."
    );
});

void test("omits blank line after trailing function declarations in blocks", async () => {
    const source = ["function outer() {", "    function inner() {", "        return 1;", "    }", "}", ""].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    const trailingLines = lines.slice(-3);

    assert.notDeepEqual(
        trailingLines,
        ["    }", "", "}"],
        "Expected the formatter to omit a blank line after trailing function declarations within blocks."
    );
});
