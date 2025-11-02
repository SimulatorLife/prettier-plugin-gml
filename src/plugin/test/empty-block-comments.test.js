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

describe("empty block comments", () => {
    it("keeps single-line block comments inline inside empty blocks", async () => {
        const source = "function make_game(_genre) { /* ... */ }\n";

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function make_game",
            "/// @param genre",
            "/// @returns {undefined}",
            "function make_game(_genre) { /* ... */ }",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
