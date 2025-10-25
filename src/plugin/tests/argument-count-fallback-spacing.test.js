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

test("preserves blank line after condensing argument_count fallbacks", async () => {
    const source = [
        "function demo(value) {",
        "    var setting = true;",
        "    if (argument_count > 1) setting = argument[1];",
        "",
        "    var nextValue = value + 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    const declarationIndex = lines.findIndex((line) =>
        line.includes("argument_count > 1")
    );

    assert.notStrictEqual(
        declarationIndex,
        -1,
        "Expected the condensed fallback declaration to be present in the formatted output."
    );

    assert.deepEqual(
        lines.slice(declarationIndex, declarationIndex + 3),
        [
            "    var setting = (argument_count > 1 ? argument[1] : true);",
            "",
            "    var nextValue = value + 1;"
        ],
        "Expected the formatter to preserve a blank line between the condensed fallback declaration and the following statements."
    );
});
