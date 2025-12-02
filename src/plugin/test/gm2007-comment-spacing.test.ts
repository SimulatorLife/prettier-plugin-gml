import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("GM2007 trailing comment spacing", () => {
    void it("preserves inline comment alignment when terminating var declarations", async () => {
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

        const formatted = await Plugin.format(source, {
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
