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

test("converts division by two with inline comments into multiplication by one half", async () => {
    const source = [
        "function halve(value) {",
        "    return value / /* keep important comment */ 2;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.ok(
        formatted.includes(
            "    return value * /* keep important comment */ 0.5;"
        ),
        "Expected the formatter to preserve the inline comment when normalizing division by two."
    );

    assert.ok(
        !formatted.includes(
            "    return value / /* keep important comment */ 2;"
        ),
        "Expected the formatter to replace division by two with multiplication by one half."
    );
});
