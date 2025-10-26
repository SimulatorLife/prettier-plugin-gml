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

// Shared noop fallback reused by resolveFunction when callers omit overrides.
// The export must remain a stable singleton so downstream helpers can probe
// for "did the caller customize this hook?" by comparing references rather
// than threading extra flags around. The manual CLI features, for example,
// stash cleanup callbacks on the noop placeholder and later check whether the
// same instance came back from resolveFunction before executing teardown logic.
// Replacing this with per-call closures would break that reference equality
// contract and cause the deferred cleanups documented in
// docs/live-reloading-concept.md#manual-mode-cleanup-handoffs to stop firing.
const NOOP = () => {};

/**
 * Return the provided {@link candidate} when it is callable, otherwise fall
 * back to {@link fallback}. Centralizes the optional function guard repeated
 * across CLI helpers so they can avoid inlining `typeof` checks at each call
 * site.
 *
 * When no fallback is provided the helper returns a shared noop function so
 * callers can attach additional properties (such as cleanup hooks) without
 * allocating new closures for every invocation.
 *
 * @template TFunction extends Function
 * @template TFallback
 * @param {TFunction | unknown} candidate Potential function value supplied by
 *        the caller.
 * @param {TFallback} [fallback]
 * @param {{ allowFallbackNonFunction?: boolean }} [options]
 * @returns {TFunction | TFallback | (() => void)}
 */
export function resolveFunction(
    candidate,
    fallback,
    { allowFallbackNonFunction = false } = {}
) {
    if (typeof candidate === "function") {
        return candidate;
    }

    if (fallback === undefined) {
        return NOOP;
    }

    if (typeof fallback === "function" || allowFallbackNonFunction) {
        return fallback;
    }

    throw new TypeError("resolveFunction fallback must be a function.");
}

export { NOOP as noop };
