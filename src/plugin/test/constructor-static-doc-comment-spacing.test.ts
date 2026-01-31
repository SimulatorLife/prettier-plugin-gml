import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("constructor static doc comment spacing", () => {
    void it("keeps constructor doc comments adjacent to the opening brace", async () => {
        const source = [
            "function Example() constructor {",
            "",
            "    /// @returns {undefined}",
            "    static clear = function() {",
            "        return 1;",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);
        const lines = formatted.split("\n");
        const functionIndex = lines.findIndex((line) => line.startsWith("function Example() constructor {"));

        assert.notStrictEqual(functionIndex, -1, "The formatted output should include the constructor header.");
        assert.ok(
            lines[functionIndex + 1]?.startsWith("    ///"),
            "The doc comment should immediately follow the constructor header."
        );
        assert.strictEqual(
            lines[functionIndex + 2],
            "    static clear = function () {",
            "The static declaration should immediately follow the doc comment."
        );
    });
});
