import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

void test("merges doc comments without duplicating returns metadata", async () => {
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

    const formatted = await Plugin.format(source);
    const returnMatches = formatted.match(/\/\/\/ @returns/g) ?? [];

    assert.equal(
        returnMatches.length,
        1,
        "Expected duplicate @returns metadata to be removed when merging doc comments"
    );
});

void test("uses actual parameter name when documented name differs", async () => {
    const source = [
        "/// @param fontName   The target font, as a string",
        "/// @param character  Character to test for, as a string",
        "function scribble_font_has_character(_font_name, _character) {",
        "    return global._scribble_chars[$ _font_name] == _character;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.ok(
        formatted.includes(
            "/// @param font_name - The target font, as a string"
        ),
        "Expected the formatter to update the documented alias for the parameter"
    );
    assert.ok(
        !formatted.includes("fontName"),
        "Expected the formatter to replace the misnamed alias with the parameter identifier"
    );
});

void test("converts Returns comment lines into returns metadata", async () => {
    const source = [
        "/// @function has_feature",
        "///              Returns: Boolean, indicating whether conversion occurs",
        "function has_feature() {",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.ok(
        formatted.includes(
            "/// @returns {bool} Indicating whether conversion occurs"
        ),
        "Expected un-annotated return comment line to be converted into @returns metadata"
    );
    assert.ok(
        !formatted.includes("Returns: Boolean"),
        "Expected the Returns description line to be removed after conversion"
    );
});
