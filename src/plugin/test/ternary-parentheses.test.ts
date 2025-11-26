import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

test("wraps ternary initializers in parentheses", async () => {
    const source = ['var myVal13 = (3 - 2) ? "cool" : "not cool";', ""].join(
        "\n"
    );

    const formatted = await Plugin.format(source, { parser: "gml-parse" });

    const expected = [
        'var myVal13 = ((3 - 2) ? "cool" : "not cool");',
        ""
    ].join("\n");

    assert.strictEqual(
        formatted,
        expected,
        "Expected ternary variable initializers to be wrapped in parentheses."
    );
});
