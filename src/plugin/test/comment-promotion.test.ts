import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { describe, it } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides) {
    const formatted = await prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse",
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError(
            "Prettier returned a non-string result when formatting GML."
        );
    }

    return formatted.trim();
}

describe("comment promotion and normalization", () => {
    it("promotes leading summary comments to @description", async () => {
        const sourceCode = [
            "// / Leading summary",
            "// / Additional note",
            "/// @param value - the input",
            "function demo(value) {",
            "    return value;",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(sourceCode);

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

    it("normalises @func to @function", async () => {
        const sourceCode = [
            "function someFunc() {",
            "    // @func freeze()",
            "    // Additional comment",
            "    return 0;",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(sourceCode);

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
