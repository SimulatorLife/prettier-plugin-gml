import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    TestCaseStatus,
    ParseResultStatus,
    ScanStatus,
    normalizeTestCaseStatus,
    normalizeParseResultStatus,
    normalizeScanStatus,
    isTestCaseStatus,
    isParseResultStatus,
    isScanStatus
} from "../src/modules/quality-report/test-status.js";

void describe("TestCaseStatus enum", () => {
    void it("defines all expected status values", () => {
        assert.equal(TestCaseStatus.PASSED, "passed");
        assert.equal(TestCaseStatus.FAILED, "failed");
        assert.equal(TestCaseStatus.SKIPPED, "skipped");
    });

    void it("is frozen and immutable", () => {
        assert.ok(Object.isFrozen(TestCaseStatus));
    });
});

void describe("ParseResultStatus enum", () => {
    void it("defines all expected status values", () => {
        assert.equal(ParseResultStatus.OK, "ok");
        assert.equal(ParseResultStatus.ERROR, "error");
        assert.equal(ParseResultStatus.IGNORED, "ignored");
    });

    void it("is frozen and immutable", () => {
        assert.ok(Object.isFrozen(ParseResultStatus));
    });
});

void describe("ScanStatus enum", () => {
    void it("defines all expected status values", () => {
        assert.equal(ScanStatus.MISSING, "missing");
        assert.equal(ScanStatus.EMPTY, "empty");
        assert.equal(ScanStatus.FOUND, "found");
    });

    void it("is frozen and immutable", () => {
        assert.ok(Object.isFrozen(ScanStatus));
    });
});

void describe("normalizeTestCaseStatus", () => {
    void it("accepts valid test case status values", () => {
        assert.equal(normalizeTestCaseStatus("passed"), TestCaseStatus.PASSED);
        assert.equal(normalizeTestCaseStatus("failed"), TestCaseStatus.FAILED);
        assert.equal(normalizeTestCaseStatus("skipped"), TestCaseStatus.SKIPPED);
    });

    void it("normalizes case variations", () => {
        assert.equal(normalizeTestCaseStatus("PASSED"), TestCaseStatus.PASSED);
        assert.equal(normalizeTestCaseStatus("  Failed  "), TestCaseStatus.FAILED);
        assert.equal(normalizeTestCaseStatus("SKIPPED"), TestCaseStatus.SKIPPED);
    });

    void it("throws error for invalid status", () => {
        assert.throws(
            () => normalizeTestCaseStatus("invalid"),
            (error) => error instanceof Error && error.message.includes("Test case status must be one of")
        );
    });

    void it("throws TypeError for non-string values", () => {
        assert.throws(
            () => normalizeTestCaseStatus(42),
            (error) => error instanceof TypeError && error.message.includes("must be provided as a string")
        );
    });

    void it("supports custom error constructor", () => {
        class CustomError extends Error {}
        assert.throws(() => normalizeTestCaseStatus("invalid", { errorConstructor: CustomError }), CustomError);
    });
});

void describe("normalizeParseResultStatus", () => {
    void it("accepts valid parse result status values", () => {
        assert.equal(normalizeParseResultStatus("ok"), ParseResultStatus.OK);
        assert.equal(normalizeParseResultStatus("error"), ParseResultStatus.ERROR);
        assert.equal(normalizeParseResultStatus("ignored"), ParseResultStatus.IGNORED);
    });

    void it("normalizes case variations", () => {
        assert.equal(normalizeParseResultStatus("OK"), ParseResultStatus.OK);
        assert.equal(normalizeParseResultStatus("  Error  "), ParseResultStatus.ERROR);
    });

    void it("throws error for invalid status", () => {
        assert.throws(
            () => normalizeParseResultStatus("unknown"),
            (error) => error instanceof Error && error.message.includes("Parse result status must be one of")
        );
    });

    void it("throws TypeError for non-string values", () => {
        assert.throws(
            () => normalizeParseResultStatus(null),
            (error) => error instanceof TypeError && error.message.includes("must be provided as a string")
        );
    });
});

void describe("normalizeScanStatus", () => {
    void it("accepts valid scan status values", () => {
        assert.equal(normalizeScanStatus("missing"), ScanStatus.MISSING);
        assert.equal(normalizeScanStatus("empty"), ScanStatus.EMPTY);
        assert.equal(normalizeScanStatus("found"), ScanStatus.FOUND);
    });

    void it("normalizes case variations", () => {
        assert.equal(normalizeScanStatus("MISSING"), ScanStatus.MISSING);
        assert.equal(normalizeScanStatus("  Empty  "), ScanStatus.EMPTY);
    });

    void it("throws error for invalid status", () => {
        assert.throws(
            () => normalizeScanStatus("invalid"),
            (error) => error instanceof Error && error.message.includes("Scan status must be one of")
        );
    });
});

void describe("isTestCaseStatus", () => {
    void it("returns true for valid test case statuses", () => {
        assert.equal(isTestCaseStatus("passed"), true);
        assert.equal(isTestCaseStatus("failed"), true);
        assert.equal(isTestCaseStatus("skipped"), true);
    });

    void it("returns false for invalid values", () => {
        assert.equal(isTestCaseStatus("invalid"), false);
        assert.equal(isTestCaseStatus(42), false);
        assert.equal(isTestCaseStatus(null), false);
        assert.equal(isTestCaseStatus(undefined), false);
    });

    void it("is case sensitive", () => {
        assert.equal(isTestCaseStatus("PASSED"), false);
        assert.equal(isTestCaseStatus("Passed"), false);
    });
});

void describe("isParseResultStatus", () => {
    void it("returns true for valid parse result statuses", () => {
        assert.equal(isParseResultStatus("ok"), true);
        assert.equal(isParseResultStatus("error"), true);
        assert.equal(isParseResultStatus("ignored"), true);
    });

    void it("returns false for invalid values", () => {
        assert.equal(isParseResultStatus("success"), false);
        assert.equal(isParseResultStatus(true), false);
    });
});

void describe("isScanStatus", () => {
    void it("returns true for valid scan statuses", () => {
        assert.equal(isScanStatus("missing"), true);
        assert.equal(isScanStatus("empty"), true);
        assert.equal(isScanStatus("found"), true);
    });

    void it("returns false for invalid values", () => {
        assert.equal(isScanStatus("present"), false);
        assert.equal(isScanStatus([]), false);
    });
});

void describe("edge cases and integration", () => {
    void it("test case statuses do not overlap with parse result statuses", () => {
        assert.equal(isTestCaseStatus(ParseResultStatus.OK), false);
        assert.equal(isParseResultStatus(TestCaseStatus.PASSED), false);
    });

    void it("scan statuses do not overlap with test case statuses", () => {
        assert.equal(isScanStatus(TestCaseStatus.PASSED), false);
        assert.equal(isTestCaseStatus(ScanStatus.MISSING), false);
    });

    void it("handles empty strings appropriately", () => {
        assert.equal(isTestCaseStatus(""), false);
        assert.throws(() => normalizeTestCaseStatus(""));
    });

    void it("handles whitespace-only strings appropriately", () => {
        assert.equal(isTestCaseStatus("   "), false);
        assert.throws(() => normalizeTestCaseStatus("   "));
    });
});
