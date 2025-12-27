import assert from "node:assert/strict";
import { Plugin } from "../src/index.js";
import { test } from "node:test";

// Use Plugin.format to run the plugin directly during tests

function extractDocsForFunction(formatted: string, functionName: string): Set<string> {
    const functionStart = formatted.indexOf(`function ${functionName}`);
    if (functionStart === -1) return new Set();

    const before = formatted.slice(0, functionStart);
    const lines = before.split(/\r?\n/);
    const docLines = [];

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("///")) {
            docLines.unshift(line);
        } else if (line === "") {
            continue;
        } else {
            break;
        }
    }
    return new Set(docLines);
}

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

void test("collectImplicitArgumentDocNames omits superseded argument docs", async () => {
    const formatted = await Plugin.format(SOURCE, {
        applyFeatherFixes: true
    });
    console.log(`DEBUG: formatted output:\n${  formatted}`);

    const sample2Doc = extractDocsForFunction(formatted, "sample2");

    assert.ok(
        sample2Doc.has("/// @param two"),
        "Expected synthetic doc comments to include alias doc line."
    );
    assert.ok(
        !sample2Doc.has("/// @param argument2"),
        "Expected stale argument doc entry to be removed."
    );

    const sample3Doc = extractDocsForFunction(formatted, "sample3");

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

void test("collectImplicitArgumentDocNames prefers alias docs without Feather fixes", async () => {
    const formatted = await Plugin.format(NO_FEATHER_SOURCE, {
        applyFeatherFixes: false
    });
    console.log(`DEBUG: formatted output (NO_FEATHER):\n${  formatted}`);

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

const EXISTING_DOC_SOURCE = `/// @function sampleExisting
/// @param first
/// @param second
/// @param third
function sampleExisting() {
    var first = argument0;
    var second = argument1;
    return argument2;
}
`;

void test("collectImplicitArgumentDocNames reuses documented names when alias is missing", async () => {
    const formatted = await Plugin.format(EXISTING_DOC_SOURCE);

    const docStart = formatted.indexOf("/// @function sampleExisting");
    let docEnd = formatted.indexOf("\nfunction sampleExisting", docStart);
    if (docEnd === -1) {
        docEnd = formatted.indexOf("function sampleExisting", docStart + 1);
    } else {
        docEnd += 1;
    }
    if (docEnd === -1) {
        docEnd = formatted.length;
    }

    const paramLines = new Set(
        formatted
            .slice(docStart, docEnd)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("/// @param"))
    );

    assert.ok(
        paramLines.has("/// @param third"),
        "Expected existing doc metadata to be preserved."
    );
    assert.ok(
        !paramLines.has("/// @param argument2"),
        "Expected fallback doc line to be skipped when already documented."
    );
});

const DIRECT_REFERENCE_SOURCE = `/// @function demo
/// @param foo
/// @param bar
function demo(argument0, argument1) {
    var foo = argument0;
    return argument1;
}
`;

void test("collectImplicitArgumentDocNames keeps documented names for direct references", async () => {
    const formatted = await Plugin.format(DIRECT_REFERENCE_SOURCE, {
        applyFeatherFixes: false
    });

    const docLines = formatted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(docLines, ["/// @param foo", "/// @param bar"]);
});

const DESCRIPTIVE_DOC_SOURCE = `/// @function preserveDocs
/// @param width
function preserveDocs(argument0) {
    var w = argument0;
    return argument0;
}
`;

void test("collectImplicitArgumentDocNames retains descriptive docs when alias is shorter", async () => {
    const formatted = await Plugin.format(DESCRIPTIVE_DOC_SOURCE);

    const docLines = formatted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(docLines, ["/// @param width"]);
});
