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
