import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

describe("function assignment semicolons", () => {
    it("omits semicolons when assigning function declarations", async () => {
        const source = [
            "/// @function get_debug_text",
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "/// @function get_debug_text",
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
