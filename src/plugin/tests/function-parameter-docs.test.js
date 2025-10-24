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

test("reuses renamed parameters when formatting argument references", async () => {
    const formatted = await prettier.format(
        `/// @param width
function demo(argument0) {
    return argument0;
}
`,
        {
            parser: "gml-parse",
            plugins: [pluginPath],
            applyFeatherFixes: true
        }
    );

    assert.match(
        formatted,
        /function demo\(width\) {\s+return width;\s+}/,
        "Expected argument references to reuse the renamed parameter identifier."
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

const SOURCE_WITH_DOC_MISMATCH = `/// @param sprite_index
function create_fx(sprite) {
    return sprite;
}`;

const SOURCE_WITH_DOC_COMMENT_ALIAS = `/// @function sample
/// @param alias
function sample() {
    var alias = argument0;
    var other = argument0;
    return alias + other;
}`;

test("preserves parameter order when doc comments are misordered", async () => {
    const formatted = await prettier.format(SOURCE_WITH_NAMED_PARAMS, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /function bool_negated\(a, b\)/,
        "Expected the formatter to keep the original parameter order."
    );

    const indexOfA = formatted.indexOf("/// @param {boolean} a");
    const indexOfB = formatted.indexOf("/// @param {boolean} b");

    assert.ok(
        indexOfA !== -1 && indexOfB !== -1 && indexOfA < indexOfB,
        "Expected the reordered doc comments to document 'a' before 'b'."
    );
});

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

test("normalizes doc comments that reference renamed parameters", async () => {
    const formatted = await prettier.format(SOURCE_WITH_DOC_MISMATCH, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.ok(
        formatted.includes("/// @param sprite"),
        "Expected doc comment to reference the declared parameter name."
    );
    assert.match(
        formatted,
        /function create_fx\(sprite\)/,
        "Expected parameter declaration to retain the documented identifier."
    );
    assert.ok(
        !formatted.includes("sprite_index"),
        "Expected stale doc comment names to be replaced."
    );
});

test("retains alias declarations when functions lack parameters", async () => {
    const formatted = await prettier.format(SOURCE_WITH_DOC_COMMENT_ALIAS, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /var alias = argument0;/,
        "Expected the alias declaration to remain for parameterless functions."
    );
    assert.match(
        formatted,
        /var other = alias;/,
        "Expected subsequent references to use the documented alias."
    );
});
