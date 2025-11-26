import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Plugin } from "../src/index.js";

describe("constructor instance method semicolons", () => {
    it("omits semicolons for assignments inside constructor methods", async () => {
        const source = [
            "function Line() : Shape() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "/// @function Line",
            "function Line() : Shape() constructor {",
            "",
            "    /// @function set_points",
            "    /// @param x1",
            "    /// @param y1",
            "    /// @returns {undefined}",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
