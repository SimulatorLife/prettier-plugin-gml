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

const SOURCE_WITH_ALIAS = `/// @param value
function example(argument0) {
    var value = argument0;
    return argument0;
}`;

test("omits redundant argument aliases after parameter renaming", async () => {
    const formatted = await prettier.format(SOURCE_WITH_ALIAS, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /function example\(value\)/,
        "Expected parameter name to reflect documented alias."
    );

    assert.ok(
        !formatted.includes("var value = value;"),
        "Expected redundant argument alias to be removed."
    );

    assert.ok(
        !formatted.includes("argument0"),
        "Expected argument indices to be replaced throughout the body."
    );
});

const SOURCE_WITH_NAMED_PARAMS = `/// @param {boolean} b - Second
/// @param {boolean} a - First
function bool_negated(a, b) {
    return !(a && b);
}`;

test("retains existing parameter names when docs reference other names", async () => {
    const formatted = await prettier.format(SOURCE_WITH_NAMED_PARAMS, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /function bool_negated\(a, b\)/,
        "Expected formatter to preserve the declared parameter order."
    );
});
