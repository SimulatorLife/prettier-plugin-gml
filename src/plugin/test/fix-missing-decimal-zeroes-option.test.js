import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

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
test("pads bare decimal literals by default", async () => {
    const formatted = await format(SOURCE_LINES.join("\n"));

    assert.strictEqual(
        formatted,
        [
            "",
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
