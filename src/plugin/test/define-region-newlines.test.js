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

describe("legacy define region normalization", () => {
    it("surrounds region directives rewritten from legacy defines with blank lines", async () => {
        const source = [
            "#define  LEGACY_MACRO 123456",
            "#define region Block",
            "var sentinel = true;",
            "#define end region Block",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "#macro  LEGACY_MACRO 123456",
            "",
            "#region Block",
            "",
            "var sentinel = true;",
            "",
            "#endregion Block",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
