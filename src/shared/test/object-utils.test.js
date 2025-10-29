import assert from "node:assert/strict";
import test from "node:test";

import {
    assertPlainObject,
    coalesceOption,
    describeValueWithArticle,
    formatWithIndefiniteArticle,
    getOrCreateMapEntry,
    incrementMapValue,
    isObjectLike,
    isPlainObject,
    withDefinedValue,
    withObjectLike
} from "../src/utils/object.js";

test("isPlainObject accepts non-null object literals", () => {
    assert.strictEqual(isPlainObject({}), true);
    assert.strictEqual(
        isPlainObject(Object.create(null), { allowNullPrototype: true }),
        true
    );
});

test("isPlainObject rejects arrays, null, and primitives", () => {
    assert.strictEqual(isPlainObject([]), false);
    assert.strictEqual(isPlainObject(null), false);
    assert.strictEqual(isPlainObject(42), false);
    assert.strictEqual(isPlainObject("value"), false);
});

test("assertPlainObject returns the validated reference", () => {
    const target = {};
    assert.strictEqual(assertPlainObject(target), target);
});

test("assertPlainObject throws with descriptive error messages", () => {
    assert.throws(() => assertPlainObject(null), TypeError);
    assert.throws(
        () =>
            assertPlainObject([], {
                errorMessage: "Custom plain object error"
            }),
        (error) =>
            error instanceof TypeError &&
            /Custom plain object error/.test(error.message)
    );
});

test("isObjectLike returns true for non-null objects", () => {
    assert.strictEqual(isObjectLike({}), true);
    assert.strictEqual(isObjectLike(Object.create(null)), true);
    assert.strictEqual(isObjectLike([]), true);
});

test("isObjectLike returns false for primitives and functions", () => {
    assert.strictEqual(isObjectLike(null), false);
    assert.strictEqual(isObjectLike(), false);
    assert.strictEqual(isObjectLike(0), false);
    assert.strictEqual(isObjectLike(""), false);
    assert.strictEqual(isObjectLike(Symbol("s")), false);
    assert.strictEqual(
        isObjectLike(() => {}),
        false
    );
});

test("withObjectLike invokes success branch for objects", () => {
    const target = {};
    const result = withObjectLike(
        target,
        (value) => {
            assert.strictEqual(value, target);
            return "ok";
        },
        () => "fallback"
    );

    assert.strictEqual(result, "ok");
});

test("withObjectLike falls back when value is not object-like", () => {
    let called = false;
    const result = withObjectLike(
        null,
        () => {
            called = true;
            return "ok";
        },
        () => "fallback"
    );

    assert.strictEqual(called, false);
    assert.strictEqual(result, "fallback");
});

test("withObjectLike returns fallback value when provided directly", () => {
    const result = withObjectLike(null, () => "ok", "fallback-value");
    assert.strictEqual(result, "fallback-value");
});

test("withDefinedValue invokes callback when value is defined", () => {
    let callCount = 0;
    const result = withDefinedValue(42, (value) => {
        callCount++;
        assert.strictEqual(value, 42);
        return value * 2;
    });

    assert.strictEqual(callCount, 1);
    assert.strictEqual(result, 84);
});

test("withDefinedValue uses provided fallback when value is undefined", () => {
    let fallbackCalls = 0;
    const result = withDefinedValue(
        undefined,
        () => {
            throw new Error("onDefined should not run");
        },
        () => {
            fallbackCalls++;
            return "fallback";
        }
    );

    assert.strictEqual(fallbackCalls, 1);
    assert.strictEqual(result, "fallback");
});

test("withDefinedValue returns undefined when no fallback is provided", () => {
    let called = false;
    const result = withDefinedValue(undefined, () => {
        called = true;
        return "value";
    });

    assert.strictEqual(called, false);
    assert.strictEqual(result, undefined);
});

test("coalesceOption returns the first non-nullish property", () => {
    const source = {
        __internalValue: null,
        publicValue: "result"
    };

    const value = coalesceOption(source, ["__internalValue", "publicValue"], {
        fallback: "fallback"
    });

    assert.strictEqual(value, "result");
});

test("coalesceOption respects the fallback when object is not object-like", () => {
    const value = coalesceOption(null, ["missing"], { fallback: "fallback" });
    assert.strictEqual(value, "fallback");
});

test("coalesceOption can accept null values when requested", () => {
    const source = { configured: null };

    const value = coalesceOption(source, "configured", {
        fallback: "fallback",
        acceptNull: true
    });

    assert.strictEqual(value, null);
});

test("getOrCreateMapEntry initializes values on demand", () => {
    const store = new Map();

    const entry = getOrCreateMapEntry(store, "key", () => ({ created: true }));

    assert.deepStrictEqual(entry, { created: true });
    assert.strictEqual(store.get("key"), entry);
});

test("getOrCreateMapEntry reuses existing entries without invoking initializer", () => {
    const store = new Map();
    const initial = getOrCreateMapEntry(store, "key", () => ({ count: 1 }));

    const reused = getOrCreateMapEntry(store, "key", () => {
        throw new Error("initializer should not run for existing entry");
    });

    assert.strictEqual(reused, initial);
});

test("getOrCreateMapEntry works with WeakMap instances", () => {
    const store = new WeakMap();
    const key = {};

    const value = getOrCreateMapEntry(store, key, () => ({ hits: 0 }));
    const again = getOrCreateMapEntry(store, key, () => ({ hits: 1 }));

    assert.strictEqual(again, value);
});

test("formatWithIndefiniteArticle selects the correct article", () => {
    assert.strictEqual(formatWithIndefiniteArticle("array"), "an array");
    assert.strictEqual(formatWithIndefiniteArticle("string"), "a string");
    assert.strictEqual(formatWithIndefiniteArticle(""), "a");
});

test("describeValueWithArticle formats common value types", () => {
    assert.strictEqual(describeValueWithArticle(null), "null");
    assert.strictEqual(describeValueWithArticle(), "undefined");
    assert.strictEqual(describeValueWithArticle([]), "an array");
    assert.strictEqual(describeValueWithArticle("value"), "a string");
    assert.strictEqual(describeValueWithArticle(Symbol("s")), "a symbol");
    assert.strictEqual(describeValueWithArticle(new Map()), "a Map object");
});

test("describeValueWithArticle accepts custom empty string labels", () => {
    assert.strictEqual(
        describeValueWithArticle("", { emptyStringLabel: "an empty string" }),
        "an empty string"
    );
});

test("incrementMapValue initializes missing entries with fallback", () => {
    const store = new Map();

    const result = incrementMapValue(store, "key");

    assert.strictEqual(result, 1);
    assert.strictEqual(store.get("key"), 1);
});

test("incrementMapValue coerces existing values before incrementing", () => {
    const store = new Map([
        ["alpha", "2"],
        ["beta", undefined]
    ]);

    const alpha = incrementMapValue(store, "alpha", 3);
    const beta = incrementMapValue(store, "beta", 2, { fallback: 5 });

    assert.strictEqual(alpha, 5);
    assert.strictEqual(store.get("alpha"), 5);
    assert.strictEqual(beta, 7);
    assert.strictEqual(store.get("beta"), 7);
});

test("incrementMapValue throws when store lacks map methods", () => {
    assert.throws(
        () => incrementMapValue(null, "key"),
        /store must provide get and set functions/
    );
});
