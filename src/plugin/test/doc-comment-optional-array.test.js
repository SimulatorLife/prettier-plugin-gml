import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import prettier from "prettier";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

const SOURCE = [
    "/// @function handle_lighting",
    "/// @param {real} [multiplier] - The multiplier to apply to the light direction",
    "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light",
    "function handle_lighting(multiplier = undefined, light_dir = [0, 0, -1]) {",
    "    return light_dir;",
    "}",
    ""
].join("\n");

test("doc comments preserve optional parameter defaults with nested brackets", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.match(
        formatted,
        /@param {array<real>} \[light_dir=\[0, 0, -1\]\] - The direction of the light/,
        "Expected doc comment to retain the optional parameter default text."
    );
});

test("doc comment normalization keeps nested optional defaults intact", async () => {
    const formatted = await prettier.format(SOURCE, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const docLine = formatted
        .split("\n")
        .find((line) => line.includes("@param {array<real>}"));

    assert.equal(
        docLine,
        "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light",
        "Expected doc comment normalization to preserve nested optional default text without inserting stray spacing."
    );
});
