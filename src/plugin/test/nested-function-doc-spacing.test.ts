import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

test("emits a separating blank line after documented nested functions", async () => {
    const source = [
        "function Outer() constructor {",
        "    /// @function inner",
        "    /// @returns {undefined}",
        "    function inner() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trimEnd().split("\n");
    const closingLines = lines.slice(-3);

    assert.deepEqual(
        closingLines,
        ["    }", "", "}"],
        "Expected documented nested functions to be separated from their enclosing block's closing brace with a blank line."
    );
});
