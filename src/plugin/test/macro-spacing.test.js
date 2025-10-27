import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("macro declarations avoid duplicate blank lines", async () => {
    const source = "#macro FOO 1\n\nvar value = FOO;";
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(formatted, "#macro FOO 1\n\nvar value = FOO;\n");
});

test("macro declarations add a blank line before following statements", async () => {
    const source = "#macro FOO 1\nvar value = FOO;";
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(formatted, "#macro FOO 1\n\nvar value = FOO;\n");
});

test("macro declarations stay separated on consecutive lines", async () => {
    const source = [
        "#macro FOO 1",
        "#macro BAR 2",
        "",
        "var value = FOO + BAR;"
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted,
        ["#macro FOO 1", "#macro BAR 2", "", "var value = FOO + BAR;", ""].join(
            "\n"
        )
    );
});

test("Feather-sanitized macros preserve blank lines before following statements", async () => {
    const source = [
        "#macro FOO(value) (value + 1);",
        "#macro BAR 100;",
        "",
        "var result = FOO(1) + BAR;"
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.strictEqual(
        formatted,
        [
            "#macro FOO(value) (value + 1)",
            "#macro BAR 100",
            "",
            "var result = FOO(1) + BAR;",
            ""
        ].join("\n")
    );
});

test("legacy #define macro replacements keep adjacent statements", async () => {
    const source = [
        "#define LEGACY_MACRO VALUE",
        "var value = LEGACY_MACRO;"
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted,
        ["#macro LEGACY_MACRO VALUE", "var value = LEGACY_MACRO;", ""].join(
            "\n"
        )
    );
});
