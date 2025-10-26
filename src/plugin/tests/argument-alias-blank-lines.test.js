import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const SOURCE = `/// @param width
/// @param steps
function demo(argument0, argument1) {
    var width = argument0;

    var xnet = -1;
    var ynet = -1;
    for (var i = 0; i <= 1; i+= argument1) {}
}`;

test("removing redundant argument aliases preserves intentional blank lines", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.ok(
        !formatted.includes("var width = argument0"),
        "Expected redundant alias declaration to be removed."
    );

    assert.ok(
        !formatted.includes("var xnet  = -1;\n\n    var ynet"),
        "Expected no blank line between remaining var declarations."
    );

    assert.ok(
        formatted.includes("var ynet  = -1;\n\n    for"),
        "Expected blank line between var declarations and the following for-loop."
    );
});
