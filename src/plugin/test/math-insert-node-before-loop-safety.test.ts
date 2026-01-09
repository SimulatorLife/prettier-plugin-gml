/**
 * Tests for the insertNodeBefore loop mutation safety fix.
 * This test ensures that the function correctly handles array traversal without skipping elements.
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Plugin } from "../src/index.js";

describe("Math traversal-normalization insertNodeBefore loop safety", () => {
    it("should not skip array elements when inserting nodes during traversal", async () => {
        const input = `
var a = 1;
var b = lengthdir_x(10, 45);
var c = 2;
var d = 3;
`.trim();

        const formatted = await Plugin.format(input, {
            parser: "gml",
            filepath: "test.gml",
            gmlConvertManualMath: true
        } as any);

        // The key test is that all variable declarations are preserved
        // If the loop mutation caused element skipping, some declarations would be lost
        assert.ok(formatted.includes("var a"), "Variable a should be preserved");
        assert.ok(formatted.includes("var b"), "Variable b should be preserved");
        assert.ok(formatted.includes("var c"), "Variable c should be preserved");
        assert.ok(formatted.includes("var d"), "Variable d should be preserved");
    });

    it("should correctly insert nodes before target in nested array structures", async () => {
        const input = `
{
    var x = lengthdir_x(10, 45);
    var y = 1;
    var z = 2;
}
`.trim();

        const formatted = await Plugin.format(input, {
            parser: "gml",
            filepath: "test.gml",
            gmlConvertManualMath: true
        } as any);

        // All statements in the block should be preserved
        const statementCount = (formatted.match(/var /g) || []).length;
        assert.ok(statementCount >= 3, `Expected at least 3 var statements, found ${statementCount}`);
    });

    it("should handle multiple manual math conversions in sequence", async () => {
        const input = `
var a = lengthdir_x(10, 45);
var b = lengthdir_y(10, 45);
var c = lengthdir_x(20, 90);
var d = 5;
`.trim();

        const formatted = await Plugin.format(input, {
            parser: "gml",
            filepath: "test.gml",
            gmlConvertManualMath: true
        } as any);

        // Verify all original variables are present
        assert.ok(formatted.includes("var a"), "Variable a declaration should exist");
        assert.ok(formatted.includes("var b"), "Variable b declaration should exist");
        assert.ok(formatted.includes("var c"), "Variable c declaration should exist");
        assert.ok(formatted.includes("var d"), "Variable d declaration should exist");

        // Count total variable declarations (original + any inserted)
        const totalVarCount = (formatted.match(/var /g) || []).length;
        assert.ok(totalVarCount >= 4, `Expected at least 4 var declarations, got ${totalVarCount}`);
    });
});
