import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

void test("macro declarations avoid duplicate blank lines", async () => {
    const source = "#macro FOO 1\n\nvar value = FOO;";
    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.strictEqual(formatted, "#macro FOO 1\n\nvar value = FOO;\n");
});

void test("macro declarations add a blank line before following statements", async () => {
    const source = "#macro FOO 1\nvar value = FOO;";
    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.strictEqual(formatted, "#macro FOO 1\n\nvar value = FOO;\n");
});

void test("macro declarations stay separated on consecutive lines", async () => {
    const source = ["#macro FOO 1", "#macro BAR 2", "", "var value = FOO + BAR;"].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.strictEqual(formatted, ["#macro FOO 1", "#macro BAR 2", "", "var value = FOO + BAR;", ""].join("\n"));
});

void test("Feather-sanitized macros preserve blank lines before following statements", async () => {
    const source = ["#macro FOO(value) (value + 1);", "#macro BAR 100;", "", "var result = FOO(1) + BAR;"].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    assert.strictEqual(
        formatted,
        ["#macro FOO(value) (value + 1)", "#macro BAR 100", "", "var result = FOO(1) + BAR;", ""].join("\n")
    );
});

void test("legacy #define macro replacements keep adjacent statements", async () => {
    const source = ["#define LEGACY_MACRO VALUE", "var value = LEGACY_MACRO;"].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    assert.strictEqual(formatted, ["#macro LEGACY_MACRO VALUE", "var value = LEGACY_MACRO;", ""].join("\n"));
});
