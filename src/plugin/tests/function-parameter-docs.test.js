import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const SOURCE = `/// @function scr_bezier_4
/// @param x1
/// @param y1
/// @param x2
/// @param y2
function scr_bezier_4(argument0, argument1, argument2, argument3) {
    var x1 = argument0;
    var y1 = argument1;
    return argument2 + argument3;
}`;

test("formats function parameters using documented argument names", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /function scr_bezier_4\(x1, y1, x2, y2\)/,
        "Expected documented parameter names to replace argument indices."
    );
});

test("replaces argument index references inside function bodies", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /return x2 \+ y2;/,
        "Expected argument index references to reuse documented parameter names."
    );
});
