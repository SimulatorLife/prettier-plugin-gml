import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isFiniteNumber } from "../number-utils.js";

describe("number-utils", () => {
    describe("isFiniteNumber", () => {
        it("returns true for finite numbers", () => {
            assert.equal(isFiniteNumber(0), true);
            assert.equal(isFiniteNumber(42), true);
            assert.equal(isFiniteNumber(-13.5), true);
        });

        it("returns false for non-number values", () => {
            assert.equal(isFiniteNumber(null), false);
            assert.equal(isFiniteNumber(undefined), false);
            assert.equal(isFiniteNumber("10"), false);
            assert.equal(isFiniteNumber(NaN), false);
            assert.equal(isFiniteNumber(Infinity), false);
            assert.equal(isFiniteNumber(-Infinity), false);
        });
    });
});
