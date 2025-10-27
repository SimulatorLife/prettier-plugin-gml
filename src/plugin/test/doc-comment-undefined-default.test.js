import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("treats undefined defaults as required when the signature omits the default", async () => {
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
        "/// @param foo",
        "Expected doc comments to omit optional syntax when undefined defaults are removed"
    );
    assert.match(
        formatted,
        /function sample\(foo\)/,
        "Expected the undefined default to be removed from the parameter list"
    );
});

test("preserves optional annotations when parameters are explicitly documented as optional", async () => {
    const source = [
        "/// @function sample",
        "/// @param [foo]",
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
        "Expected explicit optional annotations to be preserved"
    );
    assert.match(
        formatted,
        /function sample\(foo = undefined\)/,
        "Expected explicitly optional parameters to retain their undefined default"
    );
});
