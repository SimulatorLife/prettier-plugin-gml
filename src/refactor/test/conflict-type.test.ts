import assert from "node:assert/strict";
import test from "node:test";
import {
    ConflictType,
    isConflictType,
    parseConflictType,
    requireConflictType,
    type ConflictTypeValue
} from "../src/types.js";

void test("ConflictType enum contains expected values", () => {
    assert.equal(ConflictType.INVALID_IDENTIFIER, "invalid_identifier");
    assert.equal(ConflictType.SHADOW, "shadow");
    assert.equal(ConflictType.RESERVED, "reserved");
    assert.equal(ConflictType.MISSING_SYMBOL, "missing_symbol");
    assert.equal(ConflictType.LARGE_RENAME, "large_rename");
    assert.equal(ConflictType.MANY_DEPENDENTS, "many_dependents");
    assert.equal(ConflictType.ANALYSIS_ERROR, "analysis_error");
});

void test("ConflictType enum is frozen", () => {
    assert.ok(Object.isFrozen(ConflictType));
});

void test("isConflictType returns true for valid conflict types", () => {
    assert.ok(isConflictType("invalid_identifier"));
    assert.ok(isConflictType("shadow"));
    assert.ok(isConflictType("reserved"));
    assert.ok(isConflictType("missing_symbol"));
    assert.ok(isConflictType("large_rename"));
    assert.ok(isConflictType("many_dependents"));
    assert.ok(isConflictType("analysis_error"));
});

void test("isConflictType returns false for invalid conflict types", () => {
    assert.ok(!isConflictType("invalid"));
    assert.ok(!isConflictType("error"));
    assert.ok(!isConflictType("warning"));
    assert.ok(!isConflictType(""));
    assert.ok(!isConflictType(null));
    assert.ok(!isConflictType(undefined));
    assert.ok(!isConflictType(123));
    assert.ok(!isConflictType({}));
    assert.ok(!isConflictType([]));
});

void test("isConflictType is case-sensitive", () => {
    assert.ok(!isConflictType("SHADOW"));
    assert.ok(!isConflictType("Shadow"));
    assert.ok(!isConflictType("RESERVED"));
    assert.ok(!isConflictType("Reserved"));
    assert.ok(!isConflictType("INVALID_IDENTIFIER"));
});

void test("parseConflictType returns valid conflict type for valid input", () => {
    assert.equal(parseConflictType("invalid_identifier"), "invalid_identifier");
    assert.equal(parseConflictType("shadow"), "shadow");
    assert.equal(parseConflictType("reserved"), "reserved");
    assert.equal(parseConflictType("missing_symbol"), "missing_symbol");
    assert.equal(parseConflictType("large_rename"), "large_rename");
    assert.equal(parseConflictType("many_dependents"), "many_dependents");
    assert.equal(parseConflictType("analysis_error"), "analysis_error");
});

void test("parseConflictType returns null for invalid input", () => {
    assert.equal(parseConflictType("invalid"), null);
    assert.equal(parseConflictType("error"), null);
    assert.equal(parseConflictType(""), null);
    assert.equal(parseConflictType(null), null);
    assert.equal(parseConflictType(undefined), null);
    assert.equal(parseConflictType(123), null);
    assert.equal(parseConflictType({}), null);
});

void test("requireConflictType returns valid conflict type for valid input", () => {
    assert.equal(requireConflictType("invalid_identifier"), "invalid_identifier");
    assert.equal(requireConflictType("shadow"), "shadow");
    assert.equal(requireConflictType("reserved"), "reserved");
    assert.equal(requireConflictType("missing_symbol"), "missing_symbol");
    assert.equal(requireConflictType("large_rename"), "large_rename");
    assert.equal(requireConflictType("many_dependents"), "many_dependents");
    assert.equal(requireConflictType("analysis_error"), "analysis_error");
});

void test("requireConflictType throws TypeError for invalid conflict type", () => {
    assert.throws(() => requireConflictType("invalid"), {
        name: "TypeError",
        message:
            /Invalid conflict type.*Must be one of: invalid_identifier, shadow, reserved, missing_symbol, large_rename, many_dependents, analysis_error/
    });
});

void test("requireConflictType throws TypeError for non-string input", () => {
    assert.throws(() => requireConflictType(123), {
        name: "TypeError",
        message: /Invalid conflict type/
    });
    assert.throws(() => requireConflictType(null), {
        name: "TypeError",
        message: /Invalid conflict type/
    });
    assert.throws(() => requireConflictType(undefined), {
        name: "TypeError",
        message: /Invalid conflict type/
    });
});

void test("requireConflictType includes context in error message", () => {
    assert.throws(() => requireConflictType("invalid", "validation"), {
        name: "TypeError",
        message: /in validation/
    });
});

void test("requireConflictType error message includes received value", () => {
    assert.throws(() => requireConflictType("bad_type"), {
        name: "TypeError",
        message: /"bad_type"/
    });
});

void test("ConflictTypeValue type accepts all valid types", () => {
    const types: Array<ConflictTypeValue> = [
        ConflictType.INVALID_IDENTIFIER,
        ConflictType.SHADOW,
        ConflictType.RESERVED,
        ConflictType.MISSING_SYMBOL,
        ConflictType.LARGE_RENAME,
        ConflictType.MANY_DEPENDENTS,
        ConflictType.ANALYSIS_ERROR
    ];
    assert.equal(types.length, 7);
});

void test("parseConflictType can be used in control flow narrowing", () => {
    const rawType: string = "shadow";
    const type = parseConflictType(rawType);

    if (type !== null) {
        const _typeCheck: ConflictTypeValue = type;
        assert.ok(_typeCheck);
    }
});

void test("isConflictType can be used as type guard", () => {
    const rawType: unknown = "reserved";

    if (isConflictType(rawType)) {
        const _typeCheck: ConflictTypeValue = rawType;
        assert.ok(_typeCheck);
    }
});

void test("ConflictType constants prevent typos in branching logic", () => {
    const conflict = {
        type: ConflictType.RESERVED as ConflictTypeValue,
        message: "Test message"
    };

    assert.equal(conflict.type === ConflictType.RESERVED, true);
    assert.equal(conflict.type === ConflictType.SHADOW, false);
});

void test("Invalid strings fail fast with requireConflictType", () => {
    const invalidType = "typo_in_conflict_type";

    assert.throws(
        () => requireConflictType(invalidType),
        (error: Error) => {
            assert.ok(error instanceof TypeError);
            assert.ok(error.message.includes(invalidType));
            assert.ok(error.message.includes("invalid_identifier"));
            return true;
        }
    );
});
