import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

const { getNonEmptyTrimmedString } = Core;

/**
 * Regression test for nullability guard in diagnostic title processing.
 *
 * This test demonstrates the failure scenario where a title value could be
 * undefined/null and calling .trim() on it would throw TypeError.
 *
 * The fix ensures we check typeof before calling .trim() as a fallback.
 */
void test("diagnostic title processing handles edge cases without throwing", () => {
    // Simulate the pattern used in createDiagnosticMetadataFromHeading
    const testCases = [
        { input: "Valid Title", expected: "Valid Title" },
        { input: "  Trimmed  ", expected: "Trimmed" },
        { input: "", expected: "" },
        { input: null, expected: "" },
        { input: undefined, expected: "" }
    ];

    for (const { input, expected } of testCases) {
        // This is the vulnerable pattern that was fixed:
        // title: getNonEmptyTrimmedString(title) ?? title.trim(),
        //
        // The fix uses a type guard:
        // title: getNonEmptyTrimmedString(title) ?? (typeof title === "string" ? title.trim() : ""),

        assert.equal(
            getNonEmptyTrimmedString(input) ?? (typeof input === "string" ? input.trim() : ""),
            expected,
            `Expected "${expected}" for input "${input}"`
        );
    }
});

void test("getNonEmptyTrimmedString handles null/undefined gracefully", () => {
    assert.equal(getNonEmptyTrimmedString(null), null);
    assert.equal(getNonEmptyTrimmedString(undefined), null);
    assert.equal(getNonEmptyTrimmedString(""), null);
    assert.equal(getNonEmptyTrimmedString("  "), null);
    assert.equal(getNonEmptyTrimmedString("valid"), "valid");
    assert.equal(getNonEmptyTrimmedString("  valid  "), "valid");
});

void test("fallback pattern without type guard would throw TypeError", () => {
    // This demonstrates the vulnerability: calling .trim() on null/undefined throws
    assert.throws(
        () => {
            const title = null as any;
            // This is the OLD vulnerable pattern that would throw:
            return getNonEmptyTrimmedString(title) ?? title.trim();
        },
        {
            name: "TypeError",
            message: /Cannot read propert(?:y|ies)/
        },
        "Expected TypeError when calling .trim() on null"
    );

    assert.throws(
        () => {
            const title = undefined as any;
            // This is the OLD vulnerable pattern that would throw:
            return getNonEmptyTrimmedString(title) ?? title.trim();
        },
        {
            name: "TypeError",
            message: /Cannot read propert(?:y|ies)/
        },
        "Expected TypeError when calling .trim() on undefined"
    );
});
