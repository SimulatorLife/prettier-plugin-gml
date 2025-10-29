import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { test } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("simplifies chained multiplicative constants", async () => {
    const source = "var result = 1.3 * size * 0.12 / 1.5;\n";

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(formatted.trim(), "var result = size * 0.104;");
});
