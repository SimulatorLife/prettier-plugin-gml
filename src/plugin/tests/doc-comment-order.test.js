import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("orders doc comments for implicit argument references", async () => {
    const source = [
        "/// @function sample2",
        "/// @param first",
        "/// @param second",
        "/// @param argument2",
        "function sample2() {",
        "    var first = argument1;",
        "    var second = argument3;",
        "    var zero = argument0;",
        "    var two = argument2;",
        "    return argument3 + argument4;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const docLines = formatted
        .split("\n")
        .slice(0, 7)
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(docLines, [
        "/// @param zero",
        "/// @param first",
        "/// @param two",
        "/// @param second",
        "/// @param argument4"
    ]);
});

test("retains misordered optional parameter docs", async () => {
    const source = [
        "/// @function misordered_docs",
        "/// @param required",
        "/// @param {real} [optional_b]",
        "/// @param {string} [optional_a]",
        "function misordered_docs(required, optional_a = undefined, optional_b = 0) {",
        "    return required + optional_b;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const docLines = formatted
        .split("\n")
        .filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(docLines, [
        "/// @param required",
        "/// @param {string} [optional_a]",
        "/// @param {real} [optional_b=0]"
    ]);
});
