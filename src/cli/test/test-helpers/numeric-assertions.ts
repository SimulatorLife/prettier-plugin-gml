import assert from "node:assert/strict";
import { Core } from "@gml-modules/core";

const { areNumbersApproximatelyEqual } = Core;

/**
 * Assert that two numbers are approximately equal within a tolerance scaled
 * to their magnitude. This prevents flaky tests when comparing floating-point
 * division results or other computed numeric values that may differ slightly
 * due to rounding errors.
 *
 * @param {number} actual - The actual computed value.
 * @param {number} expected - The expected target value.
 * @param {string} [message] - Optional error message if assertion fails.
 */
export function assertApproximatelyEqual(
    actual: number,
    expected: number,
    message?: string
): void {
    if (!areNumbersApproximatelyEqual(actual, expected)) {
        const defaultMessage = `Expected ${actual} to be approximately equal to ${expected}`;
        assert.fail(message ?? defaultMessage);
    }
}
