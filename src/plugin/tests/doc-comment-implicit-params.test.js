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

/// @function sample3
/// @param first
/// @param second
/// @param argument2
function sample3() {
    var first = argument1;
    var second = argument3;
    var two = argument2;
    return argument2 + argument4;
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
    if (docEnd === -1) {
        docEnd = formatted.indexOf("function sample2", docStart + 1);
    } else {
        docEnd += 1;
    }
    if (docEnd === -1) {
        docEnd = formatted.length;
    }
    const sample2Doc = new Set(
        formatted
            .slice(docStart, docEnd)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
    );

    assert.ok(
        sample2Doc.has("/// @param two"),
        "Expected synthetic doc comments to include alias doc line."
    );
    assert.ok(
        !sample2Doc.has("/// @param argument2"),
        "Expected stale argument doc entry to be removed."
    );

    const sample3DocStart = formatted.indexOf("/// @function sample3");
    let sample3DocEnd = formatted.indexOf(
        "\nfunction sample3",
        sample3DocStart
    );
    if (sample3DocEnd === -1) {
        sample3DocEnd = formatted.indexOf(
            "function sample3",
            sample3DocStart + 1
        );
    } else {
        sample3DocEnd += 1;
    }
    if (sample3DocEnd === -1) {
        sample3DocEnd = formatted.length;
    }
    const sample3Doc = new Set(
        formatted
            .slice(sample3DocStart, sample3DocEnd)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
    );

    assert.ok(
        sample3Doc.has("/// @param two"),
        "Expected alias doc line to remain when implicit references coexist."
    );
    assert.ok(
        sample3Doc.has("/// @param argument3"),
        "Expected direct argument doc entry to be preserved when referenced."
    );
});

const NO_FEATHER_SOURCE = `/// @function sampleAlias
/// @param second
function sampleAlias(argument0, argument1) {
    var first = argument0;
    var second = argument1;
}
`;

test("collectImplicitArgumentDocNames prefers alias docs without Feather fixes", async () => {
    const formatted = await prettier.format(NO_FEATHER_SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: false
    });

    const docStart = formatted.indexOf("/// @function sampleAlias");
    let docEnd = formatted.indexOf("\nfunction sampleAlias", docStart);
    if (docEnd === -1) {
        docEnd = formatted.indexOf("function sampleAlias", docStart + 1);
    } else {
        docEnd += 1;
    }
    if (docEnd === -1) {
        docEnd = formatted.length;
    }

    const paramLines = formatted
        .slice(docStart, docEnd)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(paramLines, [
        "/// @param first",
        "/// @param second"
    ]);
});

const METADATA_SOURCE = `/// @function scr_bezier_4
/// @param width
/// @param steps
function scr_bezier_4(argument0, argument1) {
    var w = argument0;
    var step = 1 / argument1;
    return w + step;
}
`;

test("synthetic doc comments prefer existing metadata names", async () => {
    const formatted = await prettier.format(METADATA_SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const docStart = formatted.indexOf("/// @function scr_bezier_4");
    let docEnd = formatted.indexOf("\nfunction scr_bezier_4", docStart);
    if (docEnd === -1) {
        docEnd = formatted.indexOf("function scr_bezier_4", docStart + 1);
    } else {
        docEnd += 1;
    }
    if (docEnd === -1) {
        docEnd = formatted.length;
    }

    const paramLines = formatted
        .slice(docStart, docEnd)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(paramLines, [
        "/// @param width",
        "/// @param steps"
    ]);
});
