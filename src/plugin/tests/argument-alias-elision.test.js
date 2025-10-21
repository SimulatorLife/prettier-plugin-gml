import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const SOURCE = `/// @param value
function example(argument0) {
    var value = argument0;
    return value * value;
}`;

test("omits redundant argument aliases once parameters adopt the alias name", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /function example\(value\)/,
        "Expected the argument index to be replaced by the alias name."
    );

    assert.doesNotMatch(
        formatted,
        /var value = argument0;/,
        "Expected redundant argument alias declarations to be removed."
    );
});
