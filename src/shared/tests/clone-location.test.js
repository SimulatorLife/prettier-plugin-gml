import assert from "node:assert/strict";
import test from "node:test";

import { cloneLocation } from "../ast-locations.js";

test("cloneLocation clones plain location objects", () => {
  const location = {
    index: 12,
    line: 3,
    column: 8,
    meta: { nested: true },
  };

  const cloned = cloneLocation(location);

  assert.deepEqual(cloned, location);
  assert.notStrictEqual(cloned, location);
  assert.notStrictEqual(cloned.meta, location.meta);
});

test("cloneLocation returns undefined for nullish input", () => {
  assert.equal(cloneLocation(null), undefined);
  assert.equal(cloneLocation(undefined), undefined);
});

test("cloneLocation preserves primitive values", () => {
  assert.equal(cloneLocation(42), 42);
  assert.equal(cloneLocation("start"), "start");
});
