import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";

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

describe("GM2007 trailing comment spacing", () => {
    it("preserves inline comment alignment when terminating var declarations", async () => {
        const source = [
            "var missing",
            "var intact = 1;",
            "if (true)",
            "{",
            "    var inside",
            "    var withComment // comment",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source, {
            applyFeatherFixes: true
        });

        const expected = [
            "var missing;",
            "var intact = 1;",
            "if (true) {",
            "    var inside;",
            "    var withComment; // comment",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
