import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("promotes legacy line comment blocks to @description metadata", async () => {
    const source = [
        "// / Emulation of string_height(), but using Scribble for calculating the width",
        "// /",
        "// / **Please do not use this function in conjunction with string_copy()**",
        "/// @param string    The string to draw",
        "function string_height_scribble(_string) {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");

    assert.ok(
        lines.includes(
            "/// @description Emulation of string_height(), but using Scribble for calculating the width"
        ),
        "Expected legacy description block to be promoted to @description metadata."
    );

    const continuationIndex =
        lines.indexOf(
            "/// @description Emulation of string_height(), but using Scribble for calculating the width"
        ) + 1;
    assert.strictEqual(
        lines[continuationIndex],
        "///              **Please do not use this function in conjunction with string_copy()**",
        "Expected description continuation to preserve legacy emphasis line."
    );
});

test("normalizes legacy Returns lines into @returns metadata", async () => {
    const source = [
        "// / Tests to see if a font has the given character",
        "// /",
        "// / Returns: Boolean, indicating whether the given character is found in the font",
        "/// @param fontName   The target font, as a string",
        "function scribble_font_has_character(_font_name, _character) {",
        "    return ds_map_exists(__scribble_get_font_data(_font_name).__glyphs_map, ord(_character));",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");

    assert.ok(
        lines.includes(
            "/// @returns {bool} Indicating whether the given character is found in the font"
        ),
        "Expected legacy 'Returns:' block to be converted into @returns metadata."
    );
});
