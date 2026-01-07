/**
 * Focused test for ensuring orphaned draw_vertex calls preceded by an empty draw_primitive_begin()
 * get properly wrapped by moving a later draw_primitive_begin(pr_trianglelist) call.
 *
 * This test verifies the fix for the case where:
 * 1. There's an empty draw_primitive_begin() call (missing argument)
 * 2. Followed by draw_vertex calls
 * 3. Followed by draw_primitive_begin(pr_trianglelist)
 *
 * The expected behavior is to remove the empty begin and move the proper one before the vertices.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Plugin } from "../src/plugin-entry.js";

void describe("orphaned vertices with empty draw_primitive_begin fix", () => {
    void it("moves valid begin before vertices and removes empty begin", async () => {
        const input = `draw_primitive_begin();
draw_vertex(100, 100);
draw_vertex(200, 200);
draw_primitive_begin(pr_trianglelist);
draw_primitive_end();`;

        // The formatter should:
        // 1. Remove the empty draw_primitive_begin()
        // 2. Move draw_primitive_begin(pr_trianglelist) before the vertices
        // Note: Blank line removal and extra primitive block cleanup are separate features
        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: true
        });

        // Check that the formatted output has draw_primitive_begin(pr_trianglelist) before the first vertex
        const lines = formatted.trim().split("\n");

        // Find the line with draw_primitive_begin
        const beginIndex = lines.findIndex((line) => line.includes("draw_primitive_begin(pr_trianglelist)"));
        assert.notStrictEqual(beginIndex, -1, "Should have draw_primitive_begin(pr_trianglelist)");

        // Find the first draw_vertex line
        const firstVertexIndex = lines.findIndex((line) => line.includes("draw_vertex(100, 100)"));
        assert.notStrictEqual(firstVertexIndex, -1, "Should have draw_vertex(100, 100)");

        // The begin should come before the first vertex
        assert.ok(beginIndex < firstVertexIndex, "draw_primitive_begin should come before draw_vertex calls");

        // There should be no empty draw_primitive_begin() (without arguments)
        const hasEmptyBegin = formatted.includes("draw_primitive_begin();");
        assert.strictEqual(hasEmptyBegin, false, "Should not have empty draw_primitive_begin()");
    });

    void it("handles consecutive vertices without blank lines", async () => {
        const input = `draw_primitive_begin();
draw_vertex(100, 100);
draw_vertex(200, 200);
draw_vertex(300, 300);
draw_primitive_begin(pr_trianglelist);
draw_primitive_end();`;

        const formatted = await Plugin.format(input, {
            filepath: "test.gml",
            applyFeatherFixes: true
        });

        // Verify the structure
        const lines = formatted.trim().split("\n");
        const beginIndex = lines.findIndex((line) => line.includes("draw_primitive_begin(pr_trianglelist)"));
        const firstVertexIndex = lines.findIndex((line) => line.includes("draw_vertex(100, 100)"));
        const lastVertexIndex = lines.findIndex((line) => line.includes("draw_vertex(300, 300)"));

        assert.ok(beginIndex < firstVertexIndex, "begin should come before first vertex");
        assert.ok(firstVertexIndex < lastVertexIndex, "vertices should be in order");
        assert.strictEqual(formatted.includes("draw_primitive_begin();"), false, "no empty begin");
    });
});
