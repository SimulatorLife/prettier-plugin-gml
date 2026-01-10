/**
 * Test that comments are properly preserved when GM2023 Feather fix extracts
 * nested call expression arguments into temporary variables.
 *
 * CONTEXT: The GM2023 diagnostic identifies cases where multiple nested function
 * calls are used as arguments to another function. To improve code readability and
 * debugging, the Feather fix extracts these nested calls into temporary variables.
 *
 * REGRESSION: When temp variables were inserted before a statement, any leading
 * comments on that statement would be pushed down, appearing AFTER the temp variables
 * instead of BEFORE them. This made it appear that the comment applied to the wrong
 * code block.
 *
 * FIX: The temp variable insertion logic now adjusts source positions so that
 * Prettier's comment attachment logic attaches leading comments to the first temp
 * variable rather than the original statement. This preserves the comment's position
 * relative to the logical code block it describes.
 */

import { test } from "node:test";
import { strictEqual } from "node:assert";
import { Plugin } from "../src/index.js";

test("preserves leading comments when extracting nested calls (GM2023)", async () => {
    const input = `
// This comment describes the block below
colmesh_shape = new ColmeshBlock(scr_matrix_build(round(x), round(y), round(z), 0, 0, 0, max(a, b), 4, max(c, d)));
`.trim();

    const formatted = await Plugin.format(input, {
        parser: "gml-parse",
        applyFeatherFixes: true,
        printWidth: 80
    });

    const lines = formatted.split("\n");

    // The comment should appear BEFORE the temp variable declarations,
    // not after them.
    const commentLineIndex = lines.findIndex((line) => line.includes("This comment describes"));
    const firstTempVarIndex = lines.findIndex((line) => line.includes("__feather_call_arg"));

    strictEqual(
        commentLineIndex < firstTempVarIndex,
        true,
        `Comment should appear before temp variables. Comment at line ${commentLineIndex + 1}, first temp var at line ${firstTempVarIndex + 1}`
    );

    // Verify the comment is at the start of the block
    strictEqual(commentLineIndex, 0, "Comment should be the first line of the formatted output");
});

test("preserves multiple leading comments when extracting nested calls", async () => {
    const input = `
// Comment 1
// Comment 2
// Comment 3
result = someFunction(nested1(a), nested2(b), nested3(c));
`.trim();

    const formatted = await Plugin.format(input, {
        parser: "gml-parse",
        applyFeatherFixes: true,
        printWidth: 80
    });

    const lines = formatted.split("\n");

    // All comments should appear before temp variables
    const comment1Index = lines.findIndex((line) => line.includes("Comment 1"));
    const comment2Index = lines.findIndex((line) => line.includes("Comment 2"));
    const comment3Index = lines.findIndex((line) => line.includes("Comment 3"));
    const firstTempVarIndex = lines.findIndex((line) => line.includes("__feather_call_arg"));

    strictEqual(comment1Index < firstTempVarIndex, true, "Comment 1 should appear before temp variables");
    strictEqual(comment2Index < firstTempVarIndex, true, "Comment 2 should appear before temp variables");
    strictEqual(comment3Index < firstTempVarIndex, true, "Comment 3 should appear before temp variables");

    // Comments should be contiguous
    strictEqual(comment2Index, comment1Index + 1, "Comments should be consecutive");
    strictEqual(comment3Index, comment2Index + 1, "Comments should be consecutive");
});
