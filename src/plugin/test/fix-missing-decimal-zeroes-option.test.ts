import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

const SOURCE_LINES = [
    "function coefficients() {",
    "    var a = .5;",
    "    var b = 5.;",
    "    var c = 0.;",
    "    return a + b;",
    "}",
    ""
];

// This tests the default, opinionated behavior of the formatter
// To pad leading zeroes around decimal points and trim unnecessary trailing decimal points
void test("pads bare decimal literals by default", async () => {
    const formatted = await Plugin.format(SOURCE_LINES.join("\n"));

    assert.strictEqual(
        formatted,
        [
            "/// @function coefficients",
            "function coefficients() {",
            "    var a = 0.5;",
            "    var b = 5;",
            "    var c = 0;",
            "    return a + b;",
            "}",
            ""
        ].join("\n")
    );
});
