import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("function assignment semicolons", () => {
    void it("omits semicolons when assigning function declarations", async () => {
        const source = [
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "get_debug_text = function() {",
            "    return true;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
