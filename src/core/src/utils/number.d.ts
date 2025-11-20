/**
 * Determine whether the provided value is a finite number.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {value is number} `true` when `value` is a finite number.
 */
export declare function isFiniteNumber(value: any): boolean;
/**
 * Convert a candidate value into a finite number. Mirrors the explicit
 * `Number()` coercion followed by `Number.isFinite` checks that appear across
 * the semantic and shared helpers so call sites can centralize their numeric
 * guards without reimplementing the same fallback logic.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {number | null} Finite number when coercion succeeds; otherwise `null`.
 */
export declare function toFiniteNumber(value: any): any;
/**
 * Truncate the provided numeric value to an integer when it is a finite
 * number. Non-number and non-finite inputs yield `null` so callers can easily
 * detect invalid values without sprinkling duplicate guards.
 *
 * @param {unknown} value Potential numeric value.
 * @returns {number | null} Truncated integer when `value` is finite, otherwise
 *          `null`.
 */
export declare function toNormalizedInteger(value: any): number;
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
export declare function areNumbersApproximatelyEqual(a: any, b: any): boolean;
