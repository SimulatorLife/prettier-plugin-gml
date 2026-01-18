import assert from "node:assert/strict";
import test from "node:test";

import {
    isOccurrenceKind,
    OccurrenceKind,
    type OccurrenceKindValue,
    parseOccurrenceKind,
    requireOccurrenceKind
} from "../src/types.js";

void test("OccurrenceKind enum contains expected values", () => {
    assert.equal(OccurrenceKind.DEFINITION, "definition");
    assert.equal(OccurrenceKind.REFERENCE, "reference");
});

void test("OccurrenceKind enum is frozen", () => {
    assert.ok(Object.isFrozen(OccurrenceKind));
});

void test("isOccurrenceKind returns true for valid occurrence kinds", () => {
    assert.ok(isOccurrenceKind("definition"));
    assert.ok(isOccurrenceKind("reference"));
});

void test("isOccurrenceKind returns false for invalid occurrence kinds", () => {
    assert.ok(!isOccurrenceKind("invalid"));
    assert.ok(!isOccurrenceKind("write"));
    assert.ok(!isOccurrenceKind("read"));
    assert.ok(!isOccurrenceKind("declaration"));
    assert.ok(!isOccurrenceKind(""));
    assert.ok(!isOccurrenceKind(null));
    assert.ok(!isOccurrenceKind(undefined));
    assert.ok(!isOccurrenceKind(123));
    assert.ok(!isOccurrenceKind({}));
    assert.ok(!isOccurrenceKind([]));
});

void test("isOccurrenceKind is case-sensitive", () => {
    assert.ok(!isOccurrenceKind("DEFINITION"));
    assert.ok(!isOccurrenceKind("Definition"));
    assert.ok(!isOccurrenceKind("REFERENCE"));
    assert.ok(!isOccurrenceKind("Reference"));
});

void test("parseOccurrenceKind returns valid occurrence kind for valid input", () => {
    assert.equal(parseOccurrenceKind("definition"), "definition");
    assert.equal(parseOccurrenceKind("reference"), "reference");
});

void test("parseOccurrenceKind returns null for invalid input", () => {
    assert.equal(parseOccurrenceKind("invalid"), null);
    assert.equal(parseOccurrenceKind("write"), null);
    assert.equal(parseOccurrenceKind("declaration"), null);
    assert.equal(parseOccurrenceKind(""), null);
    assert.equal(parseOccurrenceKind(null), null);
    assert.equal(parseOccurrenceKind(undefined), null);
    assert.equal(parseOccurrenceKind(123), null);
    assert.equal(parseOccurrenceKind({}), null);
});

void test("requireOccurrenceKind returns valid occurrence kind for valid input", () => {
    assert.equal(requireOccurrenceKind("definition"), "definition");
    assert.equal(requireOccurrenceKind("reference"), "reference");
});

void test("requireOccurrenceKind throws TypeError for invalid occurrence kind", () => {
    assert.throws(() => requireOccurrenceKind("invalid"), {
        name: "TypeError",
        message: /Invalid occurrence kind.*Must be one of: definition, reference/
    });
});

void test("requireOccurrenceKind throws TypeError for non-string input", () => {
    assert.throws(() => requireOccurrenceKind(123), {
        name: "TypeError",
        message: /Invalid occurrence kind/
    });
    assert.throws(() => requireOccurrenceKind(null), {
        name: "TypeError",
        message: /Invalid occurrence kind/
    });
    assert.throws(() => requireOccurrenceKind(undefined), {
        name: "TypeError",
        message: /Invalid occurrence kind/
    });
});

void test("requireOccurrenceKind includes context in error message", () => {
    assert.throws(() => requireOccurrenceKind("invalid", "occurrence analysis"), {
        name: "TypeError",
        message: /in occurrence analysis/
    });
});

void test("requireOccurrenceKind error message includes received value", () => {
    assert.throws(() => requireOccurrenceKind("write"), {
        name: "TypeError",
        message: /"write"/
    });
});

void test("OccurrenceKindValue type accepts all valid kinds", () => {
    const kinds: Array<OccurrenceKindValue> = [OccurrenceKind.DEFINITION, OccurrenceKind.REFERENCE];
    assert.equal(kinds.length, 2);
});

void test("parseOccurrenceKind can be used in control flow narrowing", () => {
    const rawKind: string = "definition";
    const kind = parseOccurrenceKind(rawKind);

    if (kind !== null) {
        // Type should be narrowed to OccurrenceKindValue here
        const _typeCheck: OccurrenceKindValue = kind;
        assert.ok(_typeCheck);
    }
});

void test("isOccurrenceKind can be used as type guard", () => {
    const rawKind: unknown = "reference";

    if (isOccurrenceKind(rawKind)) {
        // Type should be narrowed to OccurrenceKindValue here
        const _typeCheck: OccurrenceKindValue = rawKind;
        assert.ok(_typeCheck);
    }
});

void test("OccurrenceKind constants can be used in conditionals", () => {
    const kind: OccurrenceKindValue = "definition";

    if (kind === OccurrenceKind.DEFINITION) {
        assert.ok(true);
    } else {
        assert.fail("Should match DEFINITION");
    }
});

void test("OccurrenceKind rejects invalid kinds with helpful error", () => {
    const invalidKind = "write";
    assert.throws(
        () => requireOccurrenceKind(invalidKind, "test context"),
        (error: Error) => {
            assert.ok(error instanceof TypeError);
            assert.ok(error.message.includes("Invalid occurrence kind"));
            assert.ok(error.message.includes('"write"'));
            assert.ok(error.message.includes("test context"));
            assert.ok(error.message.includes("Must be one of: definition, reference"));
            return true;
        }
    );
});
