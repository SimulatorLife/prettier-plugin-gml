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
        ...(overrides ?? {})
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

describe("top-level static function assignments", () => {
    it("restores the missing semicolon after formatting", async () => {
        const source = [
            "static initialise = function() {",
            "    return 1;",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function initialise",
            "static initialise = function() {",
            "    return 1;",
            "};",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});

describe("constructor static function assignments", () => {
    it("adds semicolons for static members", async () => {
        const source = [
            "function Shape() constructor {",
            "    static build = function() {",
            "        return 1;",
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
            "    /// @function build",
            "    static build = function() {",
            "        return 1;",
            "    };",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
