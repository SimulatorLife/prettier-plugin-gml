import test from "node:test";
import assert from "node:assert/strict";

import {
    coalesceOption,
    isObjectLike,
    withObjectLike
} from "../object-utils.js";

test("isObjectLike returns true for non-null objects", () => {
    assert.equal(isObjectLike({}), true);
    assert.equal(isObjectLike(Object.create(null)), true);
    assert.equal(isObjectLike([]), true);
});

test("isObjectLike returns false for primitives and functions", () => {
    assert.equal(isObjectLike(null), false);
    assert.equal(isObjectLike(), false);
    assert.equal(isObjectLike(0), false);
    assert.equal(isObjectLike(""), false);
    assert.equal(isObjectLike(Symbol("s")), false);
    assert.equal(
        isObjectLike(() => {}),
        false
    );
});

test("withObjectLike invokes success branch for objects", () => {
    const target = {};
    const result = withObjectLike(
        target,
        (value) => {
            assert.equal(value, target);
            return "ok";
        },
        () => "fallback"
    );

    assert.equal(result, "ok");
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

    assert.equal(called, false);
    assert.equal(result, "fallback");
});

test("withObjectLike returns fallback value when provided directly", () => {
    const result = withObjectLike(null, () => "ok", "fallback-value");
    assert.equal(result, "fallback-value");
});

test("coalesceOption returns the first non-nullish property", () => {
    const source = {
        __internalValue: null,
        publicValue: "result"
    };

    const value = coalesceOption(source, ["__internalValue", "publicValue"], {
        fallback: "fallback"
    });

    assert.equal(value, "result");
});

test("coalesceOption respects the fallback when object is not object-like", () => {
    const value = coalesceOption(null, ["missing"], { fallback: "fallback" });
    assert.equal(value, "fallback");
});

test("coalesceOption can accept null values when requested", () => {
    const source = { configured: null };

    const value = coalesceOption(source, "configured", {
        fallback: "fallback",
        acceptNull: true
    });

    assert.equal(value, null);
});
