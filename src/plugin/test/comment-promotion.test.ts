import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("comment promotion and normalization", () => {
    void it("promotes leading summary comments to @description", async () => {
        const sourceCode = [
            "// / Leading summary",
            "// / Additional note",
            "/// @param value - the input",
            "function demo(value) {",
            "    return value;",
            "}"
        ].join("\n");

        const formatted = await Plugin.format(sourceCode);

        const hasDesc = formatted.includes("@description");
        assert.ok(hasDesc, "Expected formatted output to include an @description promotion");

        const unpromoted = formatted.includes("// / ");
        assert.strictEqual(unpromoted, false, "Expected no remaining unpromoted '// / ' lines");
    });
});
