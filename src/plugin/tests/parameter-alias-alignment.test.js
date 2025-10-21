import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const SOURCE = `/// @function sample_bezier
/// @param width
/// @param steps
function sample_bezier(argument0, argument1) {
    var w = argument0;
    var step_size = 1 / argument1;

    var xnet = -1;
    var ynet = -1;

    return w + step_size + xnet + ynet;
}`;

test("aligns surviving variable declarations after alias removal", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.ok(
        formatted.includes("var w         = width;"),
        "Expected the alias declaration to retain padded alignment."
    );

    assert.ok(
        formatted.includes("var xnet      = -1;"),
        "Expected surviving declarations to align with the padded group."
    );

    assert.ok(
        formatted.includes("var ynet      = -1;"),
        "Expected trailing declarations to inherit the alignment padding."
    );
});
