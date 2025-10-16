import assert from "node:assert/strict";
import test from "node:test";

import { cloneLocation } from "../ast-locations.js";

test("cloneLocation clones plain location objects", () => {
    const location = {
        index: 12,
        line: 3,
        column: 8,
        meta: { nested: true }
    };

    const cloned = cloneLocation(location);

    assert.deepEqual(cloned, location);
    assert.notStrictEqual(cloned, location);
    assert.notStrictEqual(cloned.meta, location.meta);
});

test("cloneLocation returns undefined for nullish input", () => {
    assert.equal(cloneLocation(null), undefined);
    assert.equal(cloneLocation(), undefined);
});

test("cloneLocation preserves primitive values", () => {
    assert.equal(cloneLocation(42), 42);
    assert.equal(cloneLocation("start"), "start");
});

test("cloneLocation clones nested arrays and objects", () => {
    const location = {
        index: 4,
        trail: [1, { nested: [2, 3] }]
    };

    const cloned = cloneLocation(location);

    assert.deepEqual(cloned, location);
    assert.notStrictEqual(cloned, location);
    assert.notStrictEqual(cloned.trail, location.trail);
    assert.notStrictEqual(cloned.trail[1], location.trail[1]);
});
