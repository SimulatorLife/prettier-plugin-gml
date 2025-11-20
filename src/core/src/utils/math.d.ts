/**
 * Compute a numeric tolerance scaled to the magnitude of the supplied
 * reference value. This is used in the transforms to decide when a computed
 * numeric expression is "close enough" to a target (for example 1 or 0.5)
 * to be considered equal.
 *
 * @param {number} reference Reference value whose magnitude determines scale.
 * @returns {number} Non-negative tolerance value.
 */
export declare function computeNumericTolerance(reference: any): number;
/**
 * Compare two literal numeric values for approximate equality. Delegates to
 * the shared approximate-equality helper but keeps the name expected by the
 * older transform code (which calls `areLiteralNumbersApproximatelyEqual`).
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export declare function areLiteralNumbersApproximatelyEqual(
    a: any,
    b: any
): boolean;
/**
 * Normalize a numeric coefficient for use in generated numeric literals.
 *
 * Rules used here are intentionally conservative:
 * - Non-finite numbers return `null` so callers can abort transformations.
 * - Values extremely close to integers are rounded to the nearest integer.
 * - Otherwise the number is represented using up to 15 significant digits
 *   (similar to JSON.stringify/Number.toString behaviour) and trailing zero
 *   noise is trimmed.
 *
 * Returning a string gives the calling code direct control over the literal
 * representation without further formatting steps.
 *
 * @param {number} value Numeric value to normalize.
 * @returns {string | null} String representation or `null` when normalization fails.
 */
export declare function normalizeNumericCoefficient(value: any): string;
