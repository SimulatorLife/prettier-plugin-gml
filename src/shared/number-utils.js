/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
export function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
