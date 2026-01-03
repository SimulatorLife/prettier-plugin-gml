import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { areNumbersApproximatelyEqual, isFiniteNumber, toNormalizedInteger } from "../src/utils/number.js";

void describe("number-utils", () => {
    void describe("isFiniteNumber", () => {
        void it("returns true for finite numbers", () => {
            assert.equal(isFiniteNumber(0), true);
            assert.equal(isFiniteNumber(42), true);
            assert.equal(isFiniteNumber(-13.5), true);
        });

        void it("returns false for non-number values", () => {
            assert.equal(isFiniteNumber(null), false);
            assert.equal(isFiniteNumber(), false);
            assert.equal(isFiniteNumber("10"), false);
            assert.equal(isFiniteNumber(Number.NaN), false);
            assert.equal(isFiniteNumber(Infinity), false);
            assert.equal(isFiniteNumber(-Infinity), false);
        });
    });

    void describe("toNormalizedInteger", () => {
        void it("returns truncated integers for finite numbers", () => {
            assert.equal(toNormalizedInteger(10), 10);
            assert.equal(toNormalizedInteger(3.9), 3);
            assert.equal(toNormalizedInteger(-2.4), -2);
            assert.equal(toNormalizedInteger(-0.5), 0);
        });

        void it("returns null for non-finite inputs", () => {
            assert.equal(toNormalizedInteger(Number.NaN), null);
            assert.equal(toNormalizedInteger(Infinity), null);
            assert.equal(toNormalizedInteger(-Infinity), null);
            assert.equal(toNormalizedInteger("10"), null);
            assert.equal(toNormalizedInteger(), null);
        });
    });

    void describe("areNumbersApproximatelyEqual", () => {
        void it("treats values within the tolerance window as equal", () => {
            const delta = Number.EPSILON * 3;

            assert.equal(areNumbersApproximatelyEqual(1, 1 + delta), true);
            assert.equal(areNumbersApproximatelyEqual(0, delta), true);
        });

        void it("treats values outside the tolerance window as different", () => {
            const delta = Number.EPSILON * 6;

            assert.equal(areNumbersApproximatelyEqual(1, 1 + delta), false);
            assert.equal(areNumbersApproximatelyEqual(0, delta), false);
        });

        void it("never matches non-finite numbers", () => {
            assert.equal(areNumbersApproximatelyEqual(Number.NaN, 1), false);
            assert.equal(areNumbersApproximatelyEqual(1, Infinity), false);
            assert.equal(areNumbersApproximatelyEqual(-Infinity, Infinity), false);
        });
    });
});
