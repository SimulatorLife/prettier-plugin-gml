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

// Shared noop fallback reused across helpers that expect to decorate a stable
// callable. The export must remain a singleton so downstream consumers can
// detect "was this callback customized?" via reference equality checks instead
// of threading sentinel flags around.
const NOOP = () => {};

export { NOOP as noop };
