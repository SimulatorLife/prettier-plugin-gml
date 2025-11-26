import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

describe("Feather fix regressions", () => {
    it("resets draw_set_halign calls without leaving blank separators", async () => {
        const source = [
            "draw_set_halign(fa_right);",
            "",
            'draw_text(room_width - 5, 5, "In the top-right corner");'
        ].join("\n");

        const formatted = await Plugin.format(source, {
            applyFeatherFixes: true
        });

        assert.strictEqual(
            formatted,
            [
                "draw_set_halign(fa_right);",
                'draw_text(room_width - 5, 5, "In the top-right corner");',
                "draw_set_halign(fa_left);"
            ].join("\n")
        );
    });

    it("removes standalone vertex_end calls without preceding vertex_begin", async () => {
        const source = [
            "/// @description GM2009 - A standalone 'vertex_end' is invalid, so we'll remove it here",
            "vertex_end(vb);"
        ].join("\n");

        const formatted = await Plugin.format(source, {
            applyFeatherFixes: true
        });

        assert.strictEqual(
            formatted,
            "/// @description GM2009 - A standalone 'vertex_end' is invalid, so we'll remove it here"
        );
    });
});
