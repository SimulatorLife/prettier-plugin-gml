import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("marks undefined default parameters as optional in doc comments", async () => {
    const source = [
        "/// @function sample",
        "/// @param foo",
        "function sample(foo = undefined) {",
        "    return foo;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const lines = formatted.split("\n");
    const paramLine = lines.find((line) => line.startsWith("/// @param"));
    assert.equal(
        paramLine,
        "/// @param [foo]",
        "Expected doc comments to retain optional syntax when omitting undefined defaults"
    );
});
