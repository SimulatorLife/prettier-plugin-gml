import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const SOURCE = `/// @function sample
/// @param first
/// @param second
/// @param argument2
function sample() {
    var first = argument1;
    var second = argument3;
    return argument3 + argument4;
}

/// @function sample2
/// @param first
/// @param second
/// @param argument2
function sample2() {
    var first = argument1;
    var second = argument3;
    var zero = argument0;
    var two = argument2;
    return argument3 + argument4;
}
`;

test("collectImplicitArgumentDocNames omits superseded argument docs", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const docStart = formatted.indexOf("/// @function sample2");
    let docEnd = formatted.indexOf("\nfunction sample2", docStart);
    if (docEnd !== -1) {
        docEnd += 1;
    } else {
        docEnd = formatted.indexOf("function sample2", docStart + 1);
    }
    if (docEnd === -1) {
        docEnd = formatted.length;
    }
    const sample2Doc = formatted.slice(docStart, docEnd);

    assert.ok(
        sample2Doc.includes("/// @param two"),
        "Expected synthetic doc comments to include alias doc line."
    );
    assert.ok(
        !sample2Doc.includes("/// @param argument2"),
        "Expected stale argument doc entry to be removed."
    );
});
