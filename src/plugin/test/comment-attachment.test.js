import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });

    return formatted.trimEnd();
}

describe("comment attachment", () => {
    it("treats detached own-line comments as leading comments", async () => {
        const source = [
            "enum A {",
            "    foo,",
            "}",
            "",
            "// comment",
            "enum B {",
            "    bar,",
            "}",
            ""
        ].join("\n");

        const formatted = await format(source, { applyFeatherFixes: true });

        assert.match(
            formatted,
            /}\n\n\/\/ comment\nenum B/,
            "Expected comment to remain detached from the preceding declaration"
        );
        assert.ok(
            !formatted.includes("} // comment"),
            "Expected comment not to be treated as an inline trailing comment"
        );
    });
});
