import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

describe("constructor nested function spacing", () => {
    it("inserts a blank line after nested functions before closing the constructor", async () => {
        const source = [
            "function Outer() constructor {",
            "    function inner() {",
            "        return 1;",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await prettier.format(source, {
            plugins: [pluginPath],
            parser: "gml-parse"
        });

        const lines = formatted.split("\n");
        const closingBraceIndex = lines.lastIndexOf("}");

        assert.ok(
            closingBraceIndex > 0,
            "Formatted constructor should include a closing brace."
        );

        assert.strictEqual(
            lines[closingBraceIndex - 1],
            "",
            "Formatter should include a blank line between the nested function and the constructor closing brace."
        );
    });
});
