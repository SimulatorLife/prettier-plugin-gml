import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("empty block comments", () => {
    void it("keeps single-line block comments inline inside empty blocks", async () => {
        const source = "function make_game(_genre) { /* ... */ }\n";

        const formatted = await Plugin.format(source);

        const expected = [
            "/// @function make_game",
            "/// @param genre",
            "/// @returns {undefined}",
            "function make_game(_genre) { /* ... */ }",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
