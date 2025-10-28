/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
export function isFiniteNumber(value) {
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
export function toNormalizedInteger(value) {
    if (!isFiniteNumber(value)) {
        return null;
    }

    const normalized = Math.trunc(value);
    return Object.is(normalized, -0) ? 0 : normalized;
}

const DEFAULT_APPROXIMATE_EQUALITY_SCALE_MULTIPLIER = 4;

let approximateEqualityScaleMultiplier =
    DEFAULT_APPROXIMATE_EQUALITY_SCALE_MULTIPLIER;

export function getApproximateEqualityScaleMultiplier() {
    return approximateEqualityScaleMultiplier;
}

export function setApproximateEqualityScaleMultiplier(multiplier) {
    if (!isFiniteNumber(multiplier) || multiplier <= 0) {
        throw new TypeError(
            `Approximate equality scale multiplier must be a positive finite number (received ${multiplier}).`
        );
    }

    approximateEqualityScaleMultiplier = multiplier;
    return approximateEqualityScaleMultiplier;
}

export function resetApproximateEqualityScaleMultiplier() {
    approximateEqualityScaleMultiplier =
        DEFAULT_APPROXIMATE_EQUALITY_SCALE_MULTIPLIER;
    return approximateEqualityScaleMultiplier;
}

/**
 * Compare two numbers using a tolerance scaled to their magnitude so values
 * derived from filesystem timestamps continue to match even when floating
 * point precision differs between platforms.
 *
 * `Number.EPSILON` is scaled to the largest absolute operand and widened a bit
 * to account for file systems that round to coarse intervals (for example,
 * milliseconds versus seconds). Non-finite numbers never match to avoid
 * conflating sentinel values like `Infinity` or `NaN` with real timestamps.
 *
 * @param {number} a First number to compare.
 * @param {number} b Second number to compare.
 * @returns {boolean} `true` when both inputs are finite and fall within the
 *          dynamic tolerance window.
 */
export function areNumbersApproximatelyEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return false;
    }

    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    const tolerance =
        Number.EPSILON * scale * approximateEqualityScaleMultiplier;
    return Math.abs(a - b) <= tolerance;
}
