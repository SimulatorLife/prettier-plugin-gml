import test from "node:test";
import assert from "node:assert/strict";

import { isObjectLike } from "../object-utils.js";

test("isObjectLike returns true for non-null objects", () => {
    assert.equal(isObjectLike({}), true);
    assert.equal(isObjectLike(Object.create(null)), true);
    assert.equal(isObjectLike([]), true);
});

test("isObjectLike returns false for primitives and functions", () => {
    assert.equal(isObjectLike(null), false);
    assert.equal(isObjectLike(undefined), false);
    assert.equal(isObjectLike(0), false);
    assert.equal(isObjectLike(""), false);
    assert.equal(isObjectLike(Symbol("s")), false);
    assert.equal(
        isObjectLike(() => {}),
        false
    );
});
