import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("doc-like comment prefixes promote to @description metadata", async () => {
    const source = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}"
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.match(
        formatted,
        /\/\/\/ @description Leading summary Additional note/,
        "Expected leading doc-like comments to be normalized into @description metadata"
    );
});
