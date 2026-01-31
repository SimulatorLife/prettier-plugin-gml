import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUndoStackTrimPolicy } from "../src/runtime/undo-stack-policy.js";

void test("undo stack trim policy skips trimming when max size is unbounded", () => {
    const decision = evaluateUndoStackTrimPolicy({ maxSize: 0, currentSize: 12 });

    assert.deepEqual(decision, {
        shouldTrim: false,
        trimCount: 0,
        targetSize: 12,
        reason: "unbounded"
    });
});

void test("undo stack trim policy skips trimming when within limit", () => {
    const decision = evaluateUndoStackTrimPolicy({ maxSize: 5, currentSize: 5 });

    assert.deepEqual(decision, {
        shouldTrim: false,
        trimCount: 0,
        targetSize: 5,
        reason: "within-limit"
    });
});

void test("undo stack trim policy trims to configured limit", () => {
    const decision = evaluateUndoStackTrimPolicy({ maxSize: 3, currentSize: 8 });

    assert.deepEqual(decision, {
        shouldTrim: true,
        trimCount: 5,
        targetSize: 3,
        reason: "exceeds-limit"
    });
});
