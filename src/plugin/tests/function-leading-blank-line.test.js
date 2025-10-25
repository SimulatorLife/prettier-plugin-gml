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

test("preserves blank line between function header and first statement when authored", async () => {
    const source = [
        "function demo() {",
        "",
        "    var value = 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");
    const headerIndex = lines.indexOf("function demo() {");

    assert.notStrictEqual(
        headerIndex,
        -1,
        "Expected the formatted output to include the function declaration."
    );

    assert.equal(
        lines[headerIndex + 1],
        "",
        "Expected functions to retain an authored blank line before the first statement in the body."
    );
});
