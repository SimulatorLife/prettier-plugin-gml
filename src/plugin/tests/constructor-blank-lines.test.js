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

test("preserves blank line between constructor header and first statement", async () => {
    const source = [
        "function Demo() constructor {",
        "",
        "    self.value = 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines[2],
        "",
        "Expected constructors to retain a blank line when the input separates the header from the first statement."
    );
});

test("preserves blank line before constructor closing brace when present in input", async () => {
    const source = [
        "function Demo() constructor {",
        "    self.value = 1;",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.split("\n");

    if (lines.at(-1) === "") {
        lines.pop();
    }

    const closingBraceIndex = lines.lastIndexOf("}");

    assert.notEqual(
        closingBraceIndex,
        -1,
        "Expected formatted constructor to include a closing brace."
    );

    assert.equal(
        lines[closingBraceIndex - 1],
        "",
        "Expected constructors to retain a trailing blank line when the input separates the final statement from the closing brace."
    );
});
