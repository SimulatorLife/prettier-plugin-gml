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

    it("adds semicolons for documented constructor statics", async () => {
        const source = [
            "function Container() constructor {",
            "    /// @function first",
            "    static first = function() {",
            "        return 1;",
            "    }",
            "",
            "    /// @function second",
            "    static second = function() {",
            "        return 2;",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const firstStatic = [
            "    /// @function first",
            "    static first = function() {",
            "        return 1;",
            "    };"
        ].join("\n");

        const secondStatic = [
            "    /// @function second",
            "    static second = function() {",
            "        return 2;",
            "    };"
        ].join("\n");

        assert.ok(
            formatted.includes(firstStatic),
            "expected documented constructor statics to end with semicolons"
        );

        assert.ok(
            formatted.includes(secondStatic),
            "expected documented constructor statics to end with semicolons"
        );
    });
});
