import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Plugin } from "../src/index.js";

void describe("comment attachment", () => {
    void it("treats detached own-line comments as leading comments", async () => {
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

        const formatted = await Plugin.format(source, {
            applyFeatherFixes: true
        });

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
