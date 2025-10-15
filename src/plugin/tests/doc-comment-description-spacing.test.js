import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("preserves double spaces following doc comment hyphen", async () => {
    const source = [
        "/// @function draw_circle",
        "/// @param {real} r -  The radius of the circle",
        "function draw_circle(r) {",
        "    return r;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const [, paramLine] = formatted.split("\n");
    assert.equal(
        paramLine,
        "/// @param {real} r -  The radius of the circle",
        "Expected doc comment description spacing to be preserved"
    );
});
