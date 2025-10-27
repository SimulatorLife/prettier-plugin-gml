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

describe("function assignment semicolons", () => {
    it("omits semicolons when assigning function declarations", async () => {
        const source = [
            "/// @function get_debug_text",
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function get_debug_text",
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
