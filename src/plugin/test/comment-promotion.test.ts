import assert from "node:assert/strict";
import { Plugin } from "../src/index.js";
import { describe, it } from "node:test";

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
        assert.ok(
            hasDesc,
            "Expected formatted output to include an @description promotion"
        );

        const unpromoted = formatted.includes("// / ");
        assert.strictEqual(
            unpromoted,
            false,
            "Expected no remaining unpromoted '// / ' lines"
        );
    });

    void it("normalises @func to @function", async () => {
        const sourceCode = [
            "function someFunc() {",
            "    // @func freeze()",
            "    // Additional comment",
            "    return 0;",
            "}"
        ].join("\n");

        const formatted = await Plugin.format(sourceCode);

        // Expect the @func tag to be promoted/normalized to /// @function and
        // for legacy // @func forms to no longer be present.
        const hasNormalized = formatted.includes("/// @function freeze");
        const hasLegacy = /^\s*\/\/\s*@func\b/m.test(formatted);
        assert.ok(
            hasNormalized && !hasLegacy,
            "Expected @func to be normalised to /// @function freeze and no legacy // @func to remain"
        );
    });
});
