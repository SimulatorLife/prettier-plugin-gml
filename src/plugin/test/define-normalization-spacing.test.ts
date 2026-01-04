import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("define normalization spacing", () => {
    void it("surrounds normalized region defines with blank lines", async () => {
        const source = [
            "#define region Utility Scripts",
            "var util = function(val) {",
            "    return val;",
            "}",
            "#define end region Utility Scripts"
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "#region Utility Scripts",
            "",
            "var util = function(val) {",
            "    return val;",
            "};",
            "",
            "#endregion Utility Scripts",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    void it("adds trailing semicolons when normalizing legacy function assignments", async () => {
        const source = [
            "#define region Utility Scripts",
            "#define  end region Utility Scripts",
            "",
            "#define LEGACY_MACRO VALUE",
            "var util = function() {",
            "    return LEGACY_MACRO;",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);
        const lines = formatted.split("\n");

        const utilLineIndex = lines.indexOf("var util = function() {");
        assert.ok(utilLineIndex !== -1, "Expected the utility assignment to be printed.");

        assert.strictEqual(
            lines[utilLineIndex + 2],
            "};",
            "Expected the formatter to add a trailing semicolon after the normalized function assignment."
        );
    });

    void it("normalizes #define to #macro with single space separator", async () => {
        const input = "#define  LEGACY_MACRO 123456789\n";
        const expected = "#macro LEGACY_MACRO 123456789\n";
        const actual = await Plugin.format(input, {});
        assert.strictEqual(actual, expected);
    });

    void it("trims leading whitespace from macro suffix", async () => {
        const input = "#define    MY_CONSTANT    42\n";
        const output = await Plugin.format(input, {});
        assert.ok(output.startsWith("#macro MY_CONSTANT"));
        assert.ok(!output.startsWith("#macro  "));
    });
});
