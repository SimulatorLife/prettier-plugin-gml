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

describe("delete statements", () => {
    it("adds semicolons to delete statements", async () => {
        const formatted = await formatWithPlugin("delete foo");

        assert.strictEqual(formatted, "delete foo;\n");
    });

    it("preserves trailing comments when inserting semicolons", async () => {
        const formatted = await formatWithPlugin("delete foo // comment");

        assert.strictEqual(formatted, "delete foo; // comment\n");
    });
});
