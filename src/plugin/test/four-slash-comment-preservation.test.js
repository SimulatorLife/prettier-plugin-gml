import assert from "node:assert/strict";
import { describe, it } from "node:test";

import prettier from "prettier";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

/**
 * Format GML source using the plugin.
 * @param {string} source - GML source code
 * @returns {Promise<string>} Formatted output
 */
async function formatGml(source) {
    const result = await prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse"
    });
    return result.trim();
}

describe("four slash comment preservation", () => {
    it("preserves //// comments with plain text content", async () => {
        const input =
            "//// Set foot movement speed according to character rotation";
        const output = await formatGml(input);

        assert.strictEqual(
            output,
            "//// Set foot movement speed according to character rotation",
            "Four-slash comments with plain text should preserve the 4 slashes"
        );
    });

    it("drops purely decorative slash-only comments", async () => {
        const input = "////////////////////////";
        const output = await formatGml(input);

        assert.strictEqual(
            output,
            "",
            "Purely decorative slash-only comments should be dropped"
        );
    });

    it("normalizes banner comments with decorative patterns", async () => {
        const input = "//////// Heading ////////";
        const output = await formatGml(input);

        assert.strictEqual(
            output,
            "// Heading",
            "Banner comments with decorative patterns should be normalized"
        );
    });

    it("preserves //// comments even when followed by additional slashes in value", async () => {
        const input = "//// This is emphasized text // not a nested comment";
        const output = await formatGml(input);

        // The text after //// should be preserved as-is
        assert.ok(
            output.startsWith("////"),
            "Four-slash prefix should be preserved"
        );
        assert.ok(
            output.includes("This is emphasized text"),
            "Comment content should be preserved"
        );
    });

    it("promotes //// @tag comments to doc comments", async () => {
        const input = "//// @function myFunc";
        const output = await formatGml(input);

        assert.strictEqual(
            output,
            "/// @function myFunc",
            "Four-slash comments with @ tags should be promoted to doc comments"
        );
    });
});
