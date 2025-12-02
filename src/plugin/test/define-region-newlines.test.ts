import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("legacy define region normalization", () => {
    void it("surrounds region directives rewritten from legacy defines with blank lines", async () => {
        const source = [
            "#define  LEGACY_MACRO 123456",
            "#define region Block",
            "var sentinel = true;",
            "#define end region Block",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

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
