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

describe("constructor method semicolons", () => {
    it("preserves missing semicolons within constructor methods", async () => {
        const source = [
            "function Shape() constructor {",
            "    function set_points(x, y) {",
            "        self.x = x",
            "        self.y = y",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    /// @function set_points",
            "    /// @param x",
            "    /// @param y",
            "    /// @returns {undefined}",
            "    function set_points(x, y) {",
            "        self.x = x",
            "        self.y = y",
            "    }",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
