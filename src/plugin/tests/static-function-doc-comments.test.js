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

describe("synthetic doc comments for static members", () => {
    it("omits semicolons after static function assignments", async () => {
        const source = [
            "function Shape() constructor {",
            "    static build = function() {",
            "        return 1;",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        assert.ok(
            formatted.includes("/// @function build"),
            "Expected synthetic @function doc comment to be emitted."
        );
        assert.ok(
            formatted.includes(
                "    static build = function() {\n        return 1;\n    }\n}"
            ),
            "Static function assignments should not receive trailing semicolons."
        );
        assert.ok(
            !formatted.includes(
                "    static build = function() {\n        return 1;\n    };"
            ),
            "Trailing semicolons must be omitted when no semicolon existed in the source."
        );
    });

    it("retains semicolons for static data assignments", async () => {
        const source = [
            "function Shape() constructor {",
            "    static value = 1",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        assert.ok(
            formatted.includes("    static value = 1;"),
            "Static data assignments should still receive a trailing semicolon."
        );
    });
});
