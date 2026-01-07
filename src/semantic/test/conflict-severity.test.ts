import assert from "node:assert";
import { describe, test } from "node:test";
import {
    ConflictSeverity,
    normalizeConflictSeverity,
    normalizeConflictSeverityWithFallback,
    isConflictSeverity,
    getConflictSeverityValues,
    formatConflictSeverityList
} from "../src/identifier-case/conflict-severity.js";

describe("ConflictSeverity", () => {
    test("enum contains expected values", () => {
        assert.strictEqual(ConflictSeverity.ERROR, "error");
        assert.strictEqual(ConflictSeverity.WARNING, "warning");
        assert.strictEqual(ConflictSeverity.INFO, "info");
    });

    test("enum is frozen", () => {
        assert.throws(() => {
            (ConflictSeverity as any).CUSTOM = "custom";
        }, /Cannot add property/);
    });

    describe("normalizeConflictSeverity", () => {
        test("accepts valid lowercase severity", () => {
            assert.strictEqual(normalizeConflictSeverity("error"), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverity("warning"), ConflictSeverity.WARNING);
            assert.strictEqual(normalizeConflictSeverity("info"), ConflictSeverity.INFO);
        });

        test("accepts valid uppercase severity", () => {
            assert.strictEqual(normalizeConflictSeverity("ERROR"), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverity("WARNING"), ConflictSeverity.WARNING);
            assert.strictEqual(normalizeConflictSeverity("INFO"), ConflictSeverity.INFO);
        });

        test("accepts valid mixed-case severity", () => {
            assert.strictEqual(normalizeConflictSeverity("Error"), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverity("Warning"), ConflictSeverity.WARNING);
            assert.strictEqual(normalizeConflictSeverity("Info"), ConflictSeverity.INFO);
        });

        test("trims whitespace from valid severity", () => {
            assert.strictEqual(normalizeConflictSeverity("  error  "), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverity("\twarning\n"), ConflictSeverity.WARNING);
        });

        test("rejects invalid string severity", () => {
            assert.throws(() => {
                normalizeConflictSeverity("invalid");
            }, /Conflict severity must be one of:/);

            assert.throws(() => {
                normalizeConflictSeverity("critical");
            }, /Conflict severity must be one of:/);
        });

        test("rejects non-string severity", () => {
            assert.throws(() => {
                normalizeConflictSeverity(42);
            }, /Conflict severity must be provided as a string/);

            assert.throws(() => {
                normalizeConflictSeverity(null);
            }, /Conflict severity must be provided as a string/);

            assert.throws(() => {
                normalizeConflictSeverity(undefined);
            }, /Conflict severity must be provided as a string/);

            assert.throws(() => {
                normalizeConflictSeverity({});
            }, /Conflict severity must be provided as a string/);
        });

        test("accepts custom error constructor", () => {
            class CustomError extends Error {}

            assert.throws(() => {
                normalizeConflictSeverity("invalid", { errorConstructor: CustomError });
            }, CustomError);
        });
    });

    describe("normalizeConflictSeverityWithFallback", () => {
        test("returns normalized value for valid severity", () => {
            assert.strictEqual(normalizeConflictSeverityWithFallback("error"), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverityWithFallback("WARNING"), ConflictSeverity.WARNING);
        });

        test("returns ERROR fallback for invalid severity by default", () => {
            assert.strictEqual(normalizeConflictSeverityWithFallback("invalid"), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverityWithFallback(42), ConflictSeverity.ERROR);
            assert.strictEqual(normalizeConflictSeverityWithFallback(null), ConflictSeverity.ERROR);
        });

        test("returns custom fallback for invalid severity", () => {
            assert.strictEqual(
                normalizeConflictSeverityWithFallback("invalid", ConflictSeverity.WARNING),
                ConflictSeverity.WARNING
            );
            assert.strictEqual(
                normalizeConflictSeverityWithFallback(null, ConflictSeverity.INFO),
                ConflictSeverity.INFO
            );
        });

        test("does not throw for invalid values", () => {
            assert.doesNotThrow(() => {
                normalizeConflictSeverityWithFallback("critical");
            });
            assert.doesNotThrow(() => {
                normalizeConflictSeverityWithFallback(123);
            });
        });
    });

    describe("isConflictSeverity", () => {
        test("returns true for valid severity values", () => {
            assert.strictEqual(isConflictSeverity("error"), true);
            assert.strictEqual(isConflictSeverity("warning"), true);
            assert.strictEqual(isConflictSeverity("info"), true);
        });

        test("returns false for invalid severity values", () => {
            assert.strictEqual(isConflictSeverity("invalid"), false);
            assert.strictEqual(isConflictSeverity("critical"), false);
            assert.strictEqual(isConflictSeverity("ERROR"), false); // Case-sensitive check
            assert.strictEqual(isConflictSeverity(42), false);
            assert.strictEqual(isConflictSeverity(null), false);
            assert.strictEqual(isConflictSeverity(undefined), false);
            assert.strictEqual(isConflictSeverity({}), false);
        });
    });

    describe("getConflictSeverityValues", () => {
        test("returns all severity values", () => {
            const values = getConflictSeverityValues();
            assert.strictEqual(values.length, 3);
            assert.ok(values.includes(ConflictSeverity.ERROR));
            assert.ok(values.includes(ConflictSeverity.WARNING));
            assert.ok(values.includes(ConflictSeverity.INFO));
        });
    });

    describe("formatConflictSeverityList", () => {
        test("returns formatted list of severity values", () => {
            const list = formatConflictSeverityList();
            assert.ok(typeof list === "string");
            assert.ok(list.includes("error"));
            assert.ok(list.includes("warning"));
            assert.ok(list.includes("info"));
        });
    });

    describe("integration with identifier-case-report", () => {
        test("severity types work with conflict objects", () => {
            const conflict = {
                severity: ConflictSeverity.ERROR,
                code: "TEST_CODE",
                message: "Test message",
                scope: { id: "test", displayName: "Test" },
                identifier: "testId",
                suggestions: []
            };

            assert.strictEqual(conflict.severity, ConflictSeverity.ERROR);
            assert.strictEqual(conflict.severity, "error");
        });

        test("severity can be compared safely", () => {
            const conflicts = [
                { severity: ConflictSeverity.ERROR },
                { severity: ConflictSeverity.WARNING },
                { severity: ConflictSeverity.INFO }
            ];

            assert.strictEqual(conflicts[0].severity === ConflictSeverity.ERROR, true);
            assert.strictEqual(conflicts[1].severity === ConflictSeverity.WARNING, true);
            assert.strictEqual(conflicts[2].severity === ConflictSeverity.INFO, true);

            assert.strictEqual(conflicts[0].severity === ConflictSeverity.WARNING, false);
        });
    });
});
