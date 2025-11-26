import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import prettier from "prettier";

const __dirname = import.meta.dirname;
const pluginPath = path.resolve(__dirname, "../src/plugin-entry.js");

async function formatWithPlugin(source, overrides = {}) {
    return Plugin.format(source, {
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

test("retains documented parameter aliases when canonical names differ", async () => {
    const source = [
        "/// @param fontName   The target font, as a string",
        "/// @param character  Character to test for, as a string",
        "function scribble_font_has_character(_font_name, _character) {",
        "    return _character;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.ok(
        formatted.includes(
            "/// @param fontName - The target font, as a string"
        ),
        "Expected the formatter to preserve the documented alias for the parameter"
    );
    assert.ok(
        !formatted.includes("/// @param font_name"),
        "Expected the formatter not to replace the alias with the parameter identifier"
    );
});

test("converts legacy Returns description lines into returns metadata", async () => {
    const source = [
        "/// @function has_feature",
        "///              Returns: Boolean, indicating whether conversion occurs",
        "function has_feature() {",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.ok(
        formatted.includes(
            "/// @returns {bool} Indicating whether conversion occurs"
        ),
        "Expected legacy Returns description lines to be converted into @returns metadata"
    );
    assert.ok(
        !formatted.includes("Returns: Boolean"),
        "Expected the legacy Returns description line to be removed after conversion"
    );
});
