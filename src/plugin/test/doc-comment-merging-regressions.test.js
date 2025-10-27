import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

async function formatWithPlugin(source, overrides = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });
}

test("merges doc comments without duplicating returns metadata", async () => {
    const source = [
        "function drawer_factory() constructor {",
        "    /// @function draw_points",
        "    /// @description Draw points in array for debugging",
        "    /// @returns {undefined}",
        "    /// @returns {undefined}",
        "    static draw_points = function() {",
        "        draw_circle(0, 0, 1, false);",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const returnMatches = formatted.match(/\/\/\/ @returns/g) ?? [];

    assert.equal(
        returnMatches.length,
        1,
        "Expected duplicate @returns metadata to be removed when merging doc comments"
    );
});

test("keeps leading line comments before synthetic doc comments", async () => {
    const source = [
        "function example() {",
        "    if (condition) {",
        "        return true;",
        "    }",
        "",
        "    return false;",
        "}",
        "",
        "// Leading note about the following assignment",
        "example = function() {",
        "    return;",
        "};",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.ok(
        formatted.includes(
            "// Leading note about the following assignment\n\n/// @function example"
        ),
        "Expected the leading line comment to remain before the synthesized doc comment"
    );
});
