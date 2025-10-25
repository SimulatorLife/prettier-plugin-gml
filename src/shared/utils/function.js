/**
 * Return the provided value without modification. Centralizes the identity
 * function used across helper modules so hot paths can reuse a single exported
 * implementation instead of allocating ad-hoc closures.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function identity(value) {
    return value;
}
