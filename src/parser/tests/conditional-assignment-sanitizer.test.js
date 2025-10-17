import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    applySanitizedIndexAdjustments,
    sanitizeConditionalAssignments
} from "../src/conditional-assignment-sanitizer.js";

describe("applySanitizedIndexAdjustments", () => {
    it("maps numeric location fields back to their original indices", () => {
        const ast = {
            start: 10,
            end: 14,
            child: {
                start: { index: 11 },
                end: { index: 12 },
                nested: [{ start: 13 }, { end: { index: 15 } }]
            }
        };

        applySanitizedIndexAdjustments(ast, [5, 11, 11, 2, "ignored"]);

        assert.equal(ast.start, 8);
        assert.equal(ast.end, 11);
        assert.equal(ast.child.start.index, 9);
        assert.equal(ast.child.end.index, 9);
        assert.equal(ast.child.nested[0].start, 10);
        assert.equal(ast.child.nested[1].end.index, 12);
    });

    it("leaves values unchanged when no adjustments are provided", () => {
        const ast = { start: 3, end: { index: 4 } };

        applySanitizedIndexAdjustments(ast, null);

        assert.deepEqual(ast, { start: 3, end: { index: 4 } });
    });
});

describe("sanitizeConditionalAssignments", () => {
    it("returns null adjustments when nothing changes", () => {
        const result = sanitizeConditionalAssignments("if (foo) { bar(); }");

        assert.equal(result.indexAdjustments, null);
        assert.equal(result.sourceText, "if (foo) { bar(); }");
    });
});
