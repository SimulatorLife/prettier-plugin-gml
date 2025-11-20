import { areNumbersApproximatelyEqual } from "./number.js";
// Slightly widen epsilon comparisons to tolerate platform differences and
// floating point noise when dealing with numbers derived from parsing or
// arithmetic transformations. This multiplier mirrors the approach used in
// the number utilities so the behavior is consistent across the codebase.
const APPROXIMATE_EQUALITY_SCALE_MULTIPLIER = 4;
/**
 * Compute a numeric tolerance scaled to the magnitude of the supplied
 * reference value. This is used in the transforms to decide when a computed
 * numeric expression is "close enough" to a target (for example 1 or 0.5)
 * to be considered equal.
 *
 * @param {number} reference Reference value whose magnitude determines scale.
 * @returns {number} Non-negative tolerance value.
 */
export function computeNumericTolerance(reference) {
    const scale = Math.max(1, Math.abs(reference));
    return Number.EPSILON * scale * APPROXIMATE_EQUALITY_SCALE_MULTIPLIER;
}
/**
 * Compare two literal numeric values for approximate equality. Delegates to
 * the shared approximate-equality helper but keeps the name expected by the
 * older transform code (which calls `areLiteralNumbersApproximatelyEqual`).
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function areLiteralNumbersApproximatelyEqual(a, b) {
    return areNumbersApproximatelyEqual(a, b);
}
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
export function normalizeNumericCoefficient(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    const tol = computeNumericTolerance(value === 0 ? 1 : Math.abs(value));
    // Prefer exact integer when within tolerance.
    const nearest = Math.round(value);
    if (Math.abs(value - nearest) <= tol) {
        return String(nearest);
    }
    // Use up to 15 significant digits to avoid introducing spurious noise.
    // Trim trailing zeros and a trailing decimal point if present.
    const repr = Number(value).toPrecision(15);
    // Remove trailing zeros and the dot when unnecessary
    return repr.replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "").replace(/\.$/, "");
}
//# sourceMappingURL=math.js.map