import assert from "node:assert/strict";
import test from "node:test";

import { getCachedValue } from "../../shared/options-cache-utils.js";

test("getCachedValue caches computed results per options object", () => {
    const options = {};
    const cacheKey = Symbol("cachedValue");
    const cache = new WeakMap();
    let computeCount = 0;

    const computeValue = () => {
        computeCount += 1;
        return { created: computeCount };
    };

    const first = getCachedValue(options, cacheKey, cache, computeValue);
    const second = getCachedValue(options, cacheKey, cache, computeValue);

    assert.equal(computeCount, 1);
    assert.strictEqual(first, second);
});

test("getCachedValue returns pre-existing cacheKey property without computing", () => {
    const options = {};
    const cacheKey = Symbol("preseeded");
    const cache = new WeakMap();
    options[cacheKey] = 42;

    const result = getCachedValue(options, cacheKey, cache, () => {
        throw new Error("computeValue should not be called");
    });

    assert.equal(result, 42);
});

test("getCachedValue falls back to computing for non-object options", () => {
    let computeCount = 0;
    const computeValue = () => {
        computeCount += 1;
        return "value";
    };

    const first = getCachedValue(
        null,
        Symbol("key"),
        new WeakMap(),
        computeValue
    );
    const second = getCachedValue(
        undefined,
        Symbol("key"),
        new WeakMap(),
        computeValue
    );

    assert.equal(first, "value");
    assert.equal(second, "value");
    assert.equal(computeCount, 2);
});

test("getCachedValue computes for primitive option inputs", () => {
    let computeCount = 0;

    const first = getCachedValue(null, Symbol("primitive"), new WeakMap(), () => {
        computeCount += 1;
        return "null";
    });

    const second = getCachedValue(
        "value",
        Symbol("primitive"),
        new WeakMap(),
        () => {
            computeCount += 1;
            return "value";
        }
    );

    const third = getCachedValue(
        "value",
        Symbol("primitive"),
        new WeakMap(),
        () => {
            computeCount += 1;
            return "value";
        }
    );

    assert.equal(first, "null");
    assert.equal(second, "value");
    assert.equal(third, "value");
    assert.equal(computeCount, 3);
});
