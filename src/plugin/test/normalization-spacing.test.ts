import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("normalization spacing", () => {
    void it("surrounds region with blank lines", async () => {
        const source = [
            "#region Utility Scripts",
            "var util = function (val) {",
            "    return val;",
            "}",
            "#endregion Utility Scripts"
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "#region Utility Scripts",
            "",
            "var util = function (val) {",
            "    return val;",
            "};",
            "",
            "#endregion Utility Scripts",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    void it("does not add newlines in an empty region", async () => {
        const source = ["#region Utility Scripts", "#endregion Utility Scripts", ""].join("\n");

        const formatted = await Plugin.format(source);
        assert.strictEqual(source, formatted, "Expected the formatter to not add newlines in an empty region.");
    });

    void it("normalizes canonical #macro name separator spacing to a single space (1)", async () => {
        const input = "#macro    MY_CONSTANT    42\n";
        const output = await Plugin.format(input, {});
        assert.strictEqual(
            output,
            "#macro MY_CONSTANT 42\n",
            "Expected the formatter to trim extra whitespace from the #macro directive."
        );
    });

    void it("normalizes canonical #macro name separator spacing to a single space (2)", async () => {
        const input =
            "#macro __SCRIBBLE_PARSER_INSERT_NUKTA  ds_grid_set_grid_region(_temp_grid, _glyph_grid, _i+1, 0, _glyph_count+3, __SCRIBBLE_GEN_GLYPH.__SIZE, 0, 0);\n";
        const expected =
            "#macro __SCRIBBLE_PARSER_INSERT_NUKTA ds_grid_set_grid_region(_temp_grid, _glyph_grid, _i+1, 0, _glyph_count+3, __SCRIBBLE_GEN_GLYPH.__SIZE, 0, 0);\n";
        const output = await Plugin.format(input, {});
        assert.strictEqual(output, expected);
    });
});
