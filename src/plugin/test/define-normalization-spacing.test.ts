import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { describe, it } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

describe("define normalization spacing", () => {
    it("surrounds normalized region defines with blank lines", async () => {
        const source = [
            "#define region Utility Scripts",
            "var util = function(val) {",
            "    return val;",
            "}",
            "#define end region Utility Scripts"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
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

    it("adds trailing semicolons when normalizing legacy function assignments", async () => {
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

        const formatted = await formatWithPlugin(source);
        const lines = formatted.split("\n");

        const utilLineIndex = lines.indexOf("var util = function() {");
        assert.ok(
            utilLineIndex !== -1,
            "Expected the utility assignment to be printed."
        );

        assert.strictEqual(
            lines[utilLineIndex + 2],
            "};",
            "Expected the formatter to add a trailing semicolon after the normalized function assignment."
        );
    });
});
