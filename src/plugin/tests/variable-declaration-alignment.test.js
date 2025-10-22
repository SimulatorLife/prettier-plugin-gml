import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("aligns consecutive variable declarations inside function bodies", async () => {
    const source = [
        "function demo(a, steps, color) {",
        "    var w = a;",
        "    var step_size = steps;",
        "    var xnet = -1;",
        "    var ynet = -1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");
    const variableLines = lines.filter((line) =>
        line.trim().startsWith("var ")
    );

    assert.deepStrictEqual(
        variableLines,
        [
            "    var w         = a;",
            "    var step_size = steps;",
            "    var xnet      = -1;",
            "    var ynet      = -1;"
        ],
        "Expected local variable declarations to align their '=' operators when grouped together."
    );
});
