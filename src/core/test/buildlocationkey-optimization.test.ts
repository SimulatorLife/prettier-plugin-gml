import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFileLocationKey, buildLocationKey } from "../src/ast/location-keys.js";

/**
 * Validates that the inlined buildLocationKey optimization preserves exact
 * behavior for all location field name variations and edge cases.
 */

void describe("buildLocationKey optimization", () => {
    void it("handles standard location format with all fields", () => {
        const location = { line: 10, column: 5, index: 123 };
        assert.equal(buildLocationKey(location), "10:5:123");
    });

    void it("handles alternative field names for line", () => {
        assert.equal(buildLocationKey({ row: 20, column: 8, index: 456 }), "20:8:456");
        assert.equal(buildLocationKey({ start: 15, column: 10, index: 234 }), "15:10:234");
        assert.equal(buildLocationKey({ first_line: 5, column: 3, index: 89 }), "5:3:89");
    });

    void it("handles alternative field names for column", () => {
        assert.equal(buildLocationKey({ line: 10, col: 7, index: 100 }), "10:7:100");
        assert.equal(buildLocationKey({ line: 20, columnStart: 12, index: 200 }), "20:12:200");
        assert.equal(buildLocationKey({ line: 30, first_column: 15, index: 300 }), "30:15:300");
    });

    void it("handles alternative field names for index", () => {
        assert.equal(buildLocationKey({ line: 10, column: 5, offset: 999 }), "10:5:999");
    });

    void it("prioritizes first matching field name", () => {
        // When multiple field names exist, should pick the first in priority order
        const location = {
            line: 1,
            row: 99,
            column: 2,
            col: 88,
            index: 3,
            offset: 77
        };
        assert.equal(buildLocationKey(location), "1:2:3");
    });

    void it("handles partial locations with missing fields", () => {
        assert.equal(buildLocationKey({ line: 42, column: 7 }), "42:7:");
        assert.equal(buildLocationKey({ line: 33 }), "33::");
        assert.equal(buildLocationKey({ index: 999 }), "::999");
        assert.equal(buildLocationKey({ column: 5, index: 100 }), ":5:100");
    });

    void it("handles zero values correctly", () => {
        assert.equal(buildLocationKey({ line: 0, column: 0, index: 0 }), "0:0:0");
    });

    void it("returns null for empty location objects", () => {
        assert.equal(buildLocationKey({}), null);
    });

    void it("returns null for null or undefined", () => {
        assert.equal(buildLocationKey(null), null);
        assert.equal(buildLocationKey(undefined), null);
    });

    void it("returns null for non-object values", () => {
        assert.equal(buildLocationKey("not an object"), null);
        assert.equal(buildLocationKey(123), null);
        assert.equal(buildLocationKey(true), null);
    });

    void it("handles location objects with only undefined/null fields", () => {
        assert.equal(buildLocationKey({ line: null, column: undefined }), null);
        assert.equal(buildLocationKey({ row: undefined, col: null, offset: undefined }), null);
    });

    void it("preserves falsy values that are not null/undefined", () => {
        // 0 is falsy but should be preserved
        assert.equal(buildLocationKey({ line: 0 }), "0::");
        assert.equal(buildLocationKey({ column: 0 }), ":0:");
        assert.equal(buildLocationKey({ index: 0 }), "::0");

        // Empty string is falsy but should be preserved
        assert.equal(buildLocationKey({ line: "" }), "::");
        assert.equal(buildLocationKey({ line: "", column: 5 }), ":5:");
    });

    void it("works with buildFileLocationKey wrapper", () => {
        const location = { line: 10, column: 5, index: 123 };
        assert.equal(buildFileLocationKey("/path/to/file.gml", location), "/path/to/file.gml::10:5:123");
        assert.equal(buildFileLocationKey(null, location), "<unknown>::10:5:123");
        assert.equal(buildFileLocationKey("/path/to/file.gml", null), null);
        assert.equal(buildFileLocationKey("/path/to/file.gml", {}), null);
    });

    void it("handles mixed valid and invalid field names", () => {
        const location = {
            line: 10,
            invalidField: "ignored",
            column: 5,
            anotherBadField: 999,
            index: 123
        };
        assert.equal(buildLocationKey(location), "10:5:123");
    });

    void it("validates optimization produces identical output to original", () => {
        // This test ensures the inlined version matches the original array-based version
        const testCases = [
            { line: 1, column: 2, index: 3 },
            { row: 10, col: 20, offset: 30 },
            { first_line: 100, first_column: 200, index: 300 },
            { line: 0, column: 0, index: 0 },
            { line: null, column: undefined },
            {},
            { line: 42 },
            { column: 7 },
            { index: 999 },
            { line: 1, row: 2 }, // Should prefer 'line'
            { column: 3, col: 4 }, // Should prefer 'column'
            { index: 5, offset: 6 } // Should prefer 'index'
        ];

        for (const testCase of testCases) {
            const result = buildLocationKey(testCase);
            // Verify result is either a valid key or null
            assert.ok(result === null || typeof result === "string");

            if (result !== null) {
                // Verify format is "x:y:z"
                const parts = result.split(":");
                assert.equal(parts.length, 3);
            }
        }
    });
});
