import assert from "node:assert/strict";
import test from "node:test";

import {
    coalesceOption,
    getOrCreateMapEntry,
    isObjectLike,
    withObjectLike
} from "../object-utils.js";

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
