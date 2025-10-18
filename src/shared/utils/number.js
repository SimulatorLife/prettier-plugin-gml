/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Truncate the provided numeric value to an integer when it is a finite
 * number. Non-number and non-finite inputs yield `null` so callers can easily
 * detect invalid values without sprinkling duplicate guards.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {number | null} Truncated integer when `value` is finite, otherwise
 *          `null`.
 */
function toNormalizedInteger(value) {
    if (!isFiniteNumber(value)) {
        return null;
    }

    const normalized = Math.trunc(value);
    return Object.is(normalized, -0) ? 0 : normalized;
}

export { isFiniteNumber, toNormalizedInteger };
