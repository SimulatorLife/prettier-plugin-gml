import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("retains argument aliases when no parameters are declared", async () => {
    const source = [
        "/// @function sample",
        "/// @param first",
        "function sample() {",
        "    var first = argument0;",
        "    return argument0;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        [
            "/// @function sample",
            "/// @param first",
            "function sample() {",
            "    var first = argument0;",
            "    return argument0;",
            "}",
            ""
        ].join("\n")
    );
});
