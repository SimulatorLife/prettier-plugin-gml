import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Use the strict assertion helpers to avoid relying on Node.js' deprecated
// legacy equality APIs while keeping behaviour identical for the test inputs.

import {
    applySanitizedIndexAdjustments,
    sanitizeConditionalAssignments
} from "../src/transforms/conditional-assignment-sanitizer.js";

void describe("applySanitizedIndexAdjustments", () => {
    void it("maps numeric location fields back to their original indices", () => {
        const ast = {
            start: 10,
            end: 14,
            child: {
                start: { index: 11 },
                end: { index: 12 },
                nested: [{ start: 13 }, { end: { index: 15 } }]
            }
        };

        applySanitizedIndexAdjustments(ast, [5, 11, 11, 2, 15]);

        assert.strictEqual(ast.start, 8);
        assert.strictEqual(ast.end, 11);
        assert.strictEqual(ast.child.start.index, 9);
        assert.strictEqual(ast.child.end.index, 9);
        assert.strictEqual(ast.child.nested[0].start, 10);
        assert.strictEqual(ast.child.nested[1].end.index, 12);
    });

    void it("leaves values unchanged when no adjustments are provided", () => {
        const ast = { start: 3, end: { index: 4 } };

        applySanitizedIndexAdjustments(ast, null);

        assert.deepStrictEqual(ast, { start: 3, end: { index: 4 } });
    });
});

void describe("sanitizeConditionalAssignments", () => {
    void it("returns null adjustments when nothing changes", () => {
        const result = sanitizeConditionalAssignments("if (foo) { bar(); }");

        assert.strictEqual(result.indexAdjustments, null);
        assert.strictEqual(result.sourceText, "if (foo) { bar(); }");
    });

    void it("rewrites bare assignments inside if conditions and records positions", () => {
        const result = sanitizeConditionalAssignments("if (foo = bar) { baz(); }");

        assert.strictEqual(result.sourceText, "if (foo == bar) { baz(); }");
        assert.deepStrictEqual(result.indexAdjustments, [9]);
    });
});
