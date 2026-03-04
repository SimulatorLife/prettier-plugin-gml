import assert from "node:assert/strict";
import test from "node:test";

import {
    ConflictSeverity,
    type ConflictSeverityValue,
    isConflictSeverity,
    parseConflictSeverity,
    requireConflictSeverity
} from "../src/types.js";

void test("ConflictSeverity enum contains expected values", () => {
    assert.equal(ConflictSeverity.ERROR, "error");
    assert.equal(ConflictSeverity.WARNING, "warning");
    assert.equal(ConflictSeverity.INFO, "info");
});

void test("ConflictSeverity enum is frozen", () => {
    assert.ok(Object.isFrozen(ConflictSeverity));
});

void test("isConflictSeverity returns true for valid severity values", () => {
    assert.ok(isConflictSeverity("error"));
    assert.ok(isConflictSeverity("warning"));
    assert.ok(isConflictSeverity("info"));
});

void test("isConflictSeverity returns false for invalid severity values", () => {
    assert.ok(!isConflictSeverity("invalid"));
    assert.ok(!isConflictSeverity("ERROR"));
    assert.ok(!isConflictSeverity("WARNING"));
    assert.ok(!isConflictSeverity(""));
    assert.ok(!isConflictSeverity(null));
    assert.ok(!isConflictSeverity(undefined));
    assert.ok(!isConflictSeverity(123));
    assert.ok(!isConflictSeverity({}));
    assert.ok(!isConflictSeverity([]));
});

void test("isConflictSeverity is case-sensitive", () => {
    assert.ok(!isConflictSeverity("Error"));
    assert.ok(!isConflictSeverity("WARNING"));
    assert.ok(!isConflictSeverity("Info"));
});

void test("parseConflictSeverity returns valid severity for valid input", () => {
    assert.equal(parseConflictSeverity("error"), "error");
    assert.equal(parseConflictSeverity("warning"), "warning");
    assert.equal(parseConflictSeverity("info"), "info");
});

void test("parseConflictSeverity returns null for invalid input", () => {
    assert.equal(parseConflictSeverity("invalid"), null);
    assert.equal(parseConflictSeverity("severe"), null);
    assert.equal(parseConflictSeverity(""), null);
    assert.equal(parseConflictSeverity(null), null);
    assert.equal(parseConflictSeverity(undefined), null);
    assert.equal(parseConflictSeverity(123), null);
    assert.equal(parseConflictSeverity({}), null);
});

void test("requireConflictSeverity returns valid severity for valid input", () => {
    assert.equal(requireConflictSeverity("error"), "error");
    assert.equal(requireConflictSeverity("warning"), "warning");
    assert.equal(requireConflictSeverity("info"), "info");
});

void test("requireConflictSeverity throws TypeError for invalid string", () => {
    assert.throws(() => requireConflictSeverity("critical"), {
        name: "TypeError",
        message: /Invalid conflict severity.*Must be one of: error, warning, info/
    });
});

void test("requireConflictSeverity throws TypeError for non-string input", () => {
    assert.throws(() => requireConflictSeverity(123), {
        name: "TypeError",
        message: /Invalid conflict severity/
    });
    assert.throws(() => requireConflictSeverity(null), {
        name: "TypeError",
        message: /Invalid conflict severity/
    });
    assert.throws(() => requireConflictSeverity(undefined), {
        name: "TypeError",
        message: /Invalid conflict severity/
    });
});

void test("requireConflictSeverity includes context in error message", () => {
    assert.throws(() => requireConflictSeverity("critical", "conflict validation"), {
        name: "TypeError",
        message: /in conflict validation/
    });
});

void test("requireConflictSeverity error message includes received value", () => {
    assert.throws(() => requireConflictSeverity("bad_severity"), {
        name: "TypeError",
        message: /"bad_severity"/
    });
});

void test("ConflictSeverityValue type accepts all valid severities", () => {
    const severities: Array<ConflictSeverityValue> = [
        ConflictSeverity.ERROR,
        ConflictSeverity.WARNING,
        ConflictSeverity.INFO
    ];
    assert.equal(severities.length, 3);
});

void test("parseConflictSeverity can be used in control flow narrowing", () => {
    const rawSeverity: string = "warning";
    const severity = parseConflictSeverity(rawSeverity);

    if (severity !== null) {
        const _typeCheck: ConflictSeverityValue = severity;
        assert.ok(_typeCheck);
    }
});

void test("isConflictSeverity can be used as type guard", () => {
    const rawSeverity: unknown = "error";

    if (isConflictSeverity(rawSeverity)) {
        const _typeCheck: ConflictSeverityValue = rawSeverity;
        assert.ok(_typeCheck);
    }
});

void test("ConflictSeverity constants prevent typos in branching logic", () => {
    const conflict = {
        severity: ConflictSeverity.WARNING as ConflictSeverityValue,
        message: "Test message"
    };

    assert.equal(conflict.severity === ConflictSeverity.WARNING, true);
    assert.equal(conflict.severity === ConflictSeverity.ERROR, false);
    assert.equal(conflict.severity === ConflictSeverity.INFO, false);
});

void test("Invalid strings fail fast with requireConflictSeverity", () => {
    const invalidSeverity = "typo_in_severity";

    assert.throws(
        () => requireConflictSeverity(invalidSeverity),
        (error: Error) => {
            assert.ok(error instanceof TypeError);
            assert.ok(error.message.includes(invalidSeverity));
            assert.ok(error.message.includes("error"));
            assert.ok(error.message.includes("warning"));
            assert.ok(error.message.includes("info"));
            return true;
        }
    );
});

void test("Valid severity values pass requireConflictSeverity without throwing", () => {
    assert.doesNotThrow(() => requireConflictSeverity(ConflictSeverity.ERROR));
    assert.doesNotThrow(() => requireConflictSeverity(ConflictSeverity.WARNING));
    assert.doesNotThrow(() => requireConflictSeverity(ConflictSeverity.INFO));
});
