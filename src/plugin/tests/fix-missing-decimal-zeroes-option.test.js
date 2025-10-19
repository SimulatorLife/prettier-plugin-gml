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

const SOURCE_LINES = [
    "function coefficients() {",
    "    var a = .5;",
    "    var b = 5.;",
    "    return a + b;",
    "}",
    ""
];

test("pads bare decimal literals by default", async () => {
    const formatted = await format(SOURCE_LINES.join("\n"));

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function coefficients",
            "function coefficients() {",
            "    var a = 0.5;",
            "    var b = 5.0;",
            "    return a + b;",
            "}",
            ""
        ].join("\n")
    );
});

test("does not expose a fixMissingDecimalZeroes plugin option", async () => {
    const pluginModule = await import(pluginPath);

    assert.ok(
        !Object.hasOwn(pluginModule.options, "fixMissingDecimalZeroes"),
        "The fixMissingDecimalZeroes option should not be exported by the plugin."
    );
});
