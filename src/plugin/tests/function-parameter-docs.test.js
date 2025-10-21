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

test("initializes argument aliases using parameter names", async () => {
    const formatted = await prettier.format(
        `/// @function scr_example
/// @param width
/// @param height
function scr_example(argument0, argument1) {
    var w = argument0;
    var h = argument1;
    return w * h;
}`,
        {
            parser: "gml-parse",
            plugins: [pluginPath],
            applyFeatherFixes: true
        }
    );

    assert.match(
        formatted,
        /var w = width;/,
        "Expected aliases to reference the named parameter instead of argument indices."
    );
    assert.match(
        formatted,
        /var h = height;/,
        "Expected all aliases to use their corresponding parameter names."
    );
});
