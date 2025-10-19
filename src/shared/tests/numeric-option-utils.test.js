import assert from "node:assert/strict";
import test from "node:test";

import {
    coercePositiveInteger,
    coerceNonNegativeInteger,
    coercePositiveIntegerOption,
    resolveIntegerOption,
    normalizeNumericOption
} from "../numeric-option-utils.js";

test("coercePositiveInteger enforces a minimum of 1", () => {
    assert.strictEqual(
        coercePositiveInteger(5, { createErrorMessage: () => "" }),
        5
    );
    assert.throws(
        () =>
            coercePositiveInteger(0, { createErrorMessage: () => "too small" }),
        new TypeError("too small")
    );
});

test("coerceNonNegativeInteger enforces a minimum of 0", () => {
    assert.strictEqual(
        coerceNonNegativeInteger(2, { createErrorMessage: () => "" }),
        2
    );
    assert.throws(
        () =>
            coerceNonNegativeInteger(-1, {
                createErrorMessage: (received) => `bad: ${received}`
            }),
        new TypeError("bad: -1")
    );
});

test("coercePositiveIntegerOption falls back to defaults", () => {
    assert.strictEqual(coercePositiveIntegerOption(7, 3), 7);
    assert.strictEqual(coercePositiveIntegerOption(undefined, 3), 3);
    assert.strictEqual(coercePositiveIntegerOption(null, 3), 3);
    assert.strictEqual(coercePositiveIntegerOption(0, 3), 3);
});

test("coercePositiveIntegerOption respects zero replacement", () => {
    assert.strictEqual(
        coercePositiveIntegerOption(0, 3, { zeroReplacement: 10 }),
        10
    );
    assert.strictEqual(
        coercePositiveIntegerOption("bad", 4, { zeroReplacement: 8 }),
        4
    );
});

test("resolveIntegerOption normalizes string inputs", () => {
    const result = resolveIntegerOption(" 42 ", {
        defaultValue: 0,
        coerce(value) {
            return value + 1;
        }
    });
    assert.strictEqual(result, 43);
});

test("resolveIntegerOption returns default for blank strings", () => {
    const result = resolveIntegerOption("   ", {
        defaultValue: 9,
        coerce(value) {
            return value;
        }
    });
    assert.strictEqual(result, 9);
});

test("resolveIntegerOption throws for invalid types", () => {
    assert.throws(
        () =>
            resolveIntegerOption(
                {},
                {
                    defaultValue: 0,
                    coerce(value) {
                        return value;
                    },
                    typeErrorMessage: (type) => `bad type: ${type}`
                }
            ),
        new TypeError("bad type: object")
    );
});

test("normalizeNumericOption returns undefined for nullish inputs", () => {
    assert.strictEqual(
        normalizeNumericOption(null, {
            optionName: "example",
            coerce() {
                throw new Error("should not coerce");
            },
            formatTypeError: () => ""
        }),
        undefined
    );
});

test("normalizeNumericOption trims strings and forwards context", () => {
    let receivedOptions;
    const result = normalizeNumericOption(" 5 ", {
        optionName: "example",
        coerce(value, options) {
            receivedOptions = options;
            return value * 2;
        },
        formatTypeError(optionName, type) {
            return `${optionName}:${type}`;
        }
    });

    assert.strictEqual(result, 10);
    assert.deepStrictEqual(receivedOptions, {
        optionName: "example",
        rawType: "string",
        rawValue: " 5 ",
        received: "' 5 '",
        isString: true
    });
});

test("normalizeNumericOption forwards context for numeric inputs", () => {
    const result = normalizeNumericOption(7, {
        optionName: "example",
        coerce(value, options) {
            assert.deepStrictEqual(options, {
                optionName: "example",
                rawType: "number",
                rawValue: 7,
                received: 7,
                isString: false
            });
            return value;
        },
        formatTypeError(optionName, type) {
            return `${optionName}:${type}`;
        }
    });
    assert.strictEqual(result, 7);
});

test("normalizeNumericOption throws when type is invalid", () => {
    assert.throws(
        () =>
            normalizeNumericOption(Symbol.for("bad"), {
                optionName: "example",
                coerce(value) {
                    return value;
                },
                formatTypeError(optionName, type) {
                    return `${optionName}:${type}`;
                }
            }),
        new Error("example:symbol")
    );
});

test("normalizeNumericOption ignores blank strings", () => {
    const result = normalizeNumericOption("   ", {
        optionName: "example",
        coerce(value) {
            return value;
        },
        formatTypeError(optionName, type) {
            return `${optionName}:${type}`;
        }
    });
    assert.strictEqual(result, undefined);
});
