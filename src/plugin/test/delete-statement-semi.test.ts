import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("delete statements", () => {
    void it("adds semicolons to delete statements", async () => {
        const formatted = await Plugin.format("delete foo");

        assert.strictEqual(formatted, "delete foo;\n");
    });

    void it("preserves trailing comments when inserting semicolons", async () => {
        const formatted = await Plugin.format("delete foo // comment");

        assert.strictEqual(formatted, "delete foo; // comment\n");
    });
});
