import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertApproximatelyEqual } from "./numeric-assertions.js";

void describe("numeric-assertions", () => {
    void describe("assertApproximatelyEqual", () => {
        void it("passes when values are exactly equal", () => {
            assertApproximatelyEqual(1, 1);
            assertApproximatelyEqual(0, 0);
            assertApproximatelyEqual(-5.5, -5.5);
        });

        void it("passes when values differ by a tiny epsilon", () => {
            const epsilon = Number.EPSILON * 2;
            assertApproximatelyEqual(1, 1 + epsilon);
            assertApproximatelyEqual(100, 100 + epsilon * 100);
        });

        void it("passes for division results that might have rounding errors", () => {
            const expected = 10 / 3;
            const computed = 10 / 3;
            assertApproximatelyEqual(computed, expected);

            assertApproximatelyEqual(1 / 3, 1 / 3);
            assertApproximatelyEqual(3 / 7, 3 / 7);
        });

        void it("fails when values differ significantly", () => {
            assert.throws(() => assertApproximatelyEqual(1, 1.1), /Expected 1 to be approximately equal to 1\.1/);

            assert.throws(() => assertApproximatelyEqual(5, 6), /Expected 5 to be approximately equal to 6/);
        });

        void it("supports custom error messages", () => {
            assert.throws(
                () => assertApproximatelyEqual(1, 2, "Custom error: values should match"),
                /Custom error: values should match/
            );
        });

        void it("handles common division cases in benchmarks", () => {
            assertApproximatelyEqual(10 / 2, 5);
            assertApproximatelyEqual(9 / 3, 3);
            assertApproximatelyEqual(2 / 5, 0.4);
            assertApproximatelyEqual(3 / 7, 3 / 7);
        });
    });
});
