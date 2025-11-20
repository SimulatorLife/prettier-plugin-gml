import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source) {
    return prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse"
    });
}

describe("block initial static spacing", () => {
    it("keeps the first static declaration adjacent to the opening brace", async () => {
        const source = [
            "function example() {",
            "    static foo = 1;",
            "",
            "    var bar = 2;",
            "}",
            ""
        ].join("\n");

        const formatted = await format(source);

        const lines = formatted.split("\n");
        const functionIndex = lines.findIndex((line) =>
            line.startsWith("function example() {")
        );

        assert.notStrictEqual(
            functionIndex,
            -1,
            "The formatted output should include the function declaration."
        );
        assert.strictEqual(
            lines[functionIndex + 1],
            "    static foo = 1;",
            "The static declaration should immediately follow the opening brace."
        );
        assert.strictEqual(
            lines[functionIndex + 2],
            "",
            "A single blank line should separate the static declaration from the next statement."
        );
    });
});
