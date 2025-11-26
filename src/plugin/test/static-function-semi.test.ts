import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../dist/src/index.js"),
        path.resolve(currentDirectory, "../dist/index.js"),
        path.resolve(currentDirectory, "../src/index.ts"),
        path.resolve(currentDirectory, "../src/plugin-entry.ts"),
        path.resolve(currentDirectory, "../src/index.js"),
        path.resolve(currentDirectory, "../src/plugin-entry.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

async function formatWithPlugin(source, overrides: any = {}) {
    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

describe("constructor static function assignments", () => {
    it("adds semicolons for static function assignments", async () => {
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

    it("adds semicolons for static non-function members", async () => {
        const source = [
            "function Shape() constructor {",
            "    static value = 1",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    static value = 1;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("omits semicolons for constructor functions", async () => {
        const source = [
            "function Shape() constructor {",
            "    static value = 1;",
            "};",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    static value = 1;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
