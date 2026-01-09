/**
 * Focused test for ensuring draw_primitive_begin() calls get the required pr_trianglelist argument.
 *
 * This test verifies that when applyFeatherFixes is enabled, the formatter adds the missing
 * pr_trianglelist argument to draw_primitive_begin() calls that are missing it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Plugin } from "../src/plugin-entry.js";

void describe("draw_primitive_begin missing argument fix", () => {
    void it("adds pr_trianglelist argument to draw_primitive_begin() with no arguments", async () => {
        const input = `draw_primitive_begin();
draw_vertex(100, 100);
draw_primitive_end();`;

        const expected = `draw_primitive_begin(pr_trianglelist);
draw_vertex(100, 100);
draw_primitive_end();
`;

        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: true
        });

        assert.strictEqual(formatted, expected);
    });

    void it("preserves existing pr_trianglelist argument", async () => {
        const input = `draw_primitive_begin(pr_trianglelist);
draw_vertex(100, 100);
draw_primitive_end();`;

        const expected = `draw_primitive_begin(pr_trianglelist);
draw_vertex(100, 100);
draw_primitive_end();
`;

        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: true
        });

        assert.strictEqual(formatted, expected);
    });

    void it("adds pr_trianglelist to multiple draw_primitive_begin() calls", async () => {
        const input = `draw_primitive_begin();
draw_vertex(100, 100);
draw_primitive_end();

draw_primitive_begin();
draw_vertex(200, 200);
draw_primitive_end();`;

        const expected = `draw_primitive_begin(pr_trianglelist);
draw_vertex(100, 100);
draw_primitive_end();

draw_primitive_begin(pr_trianglelist);
draw_vertex(200, 200);
draw_primitive_end();
`;

        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: true
        });

        assert.strictEqual(formatted, expected);
    });

    void it("does not add argument when applyFeatherFixes is false", async () => {
        const input = `draw_primitive_begin();
draw_vertex(100, 100);
draw_primitive_end();`;

        const expected = `draw_primitive_begin();
draw_vertex(100, 100);
draw_primitive_end();
`;

        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: false
        });

        assert.strictEqual(formatted, expected);
    });
});
