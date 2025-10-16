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

// Prefer strict assertions; Node.js deprecated the loose equality helpers like
// assert.equal/assert.notEqual.
test("cloneLocation returns undefined for nullish input", () => {
    assert.strictEqual(cloneLocation(null), undefined);
    assert.strictEqual(cloneLocation(), undefined);
});

test("cloneLocation preserves primitive values", () => {
    assert.strictEqual(cloneLocation(42), 42);
    assert.strictEqual(cloneLocation("start"), "start");
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
