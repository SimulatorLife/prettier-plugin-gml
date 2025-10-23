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

describe("constructor instance method semicolons", () => {
    it("omits semicolons for assignments inside constructor methods", async () => {
        const source = [
            "function Line() : Shape() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function Line",
            "function Line() : Shape() constructor {",
            "",
            "    /// @function set_points",
            "    /// @param x1",
            "    /// @param y1",
            "    /// @returns {undefined}",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
