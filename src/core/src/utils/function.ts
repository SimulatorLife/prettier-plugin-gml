import { assertFunction } from "./object.js";

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

// Export a singleton no-op function for stable reference equality checks.
// Many helpers (e.g., semantic integrations, CLI cleanup handlers) need a
// shared fallback callback that does nothing. Using a module-level singleton
// allows downstream consumers to detect "was this callback customized?" via
// `callback === noop` instead of threading sentinel flags or magic strings
// around. Manual CLI flows (documented in docs/live-reloading-concept.md#manual-mode-cleanup-handoffs)
// stash this exact reference as the fallback `unsubscribe` handler, and
// semantic integrations such as `setReservedIdentifierMetadataLoader` return
// it from their setup methods so try/finally cleanup blocks stay balanced.
// Replacing this with an inline arrow function—even one that does nothing—
// would break reference equality checks, causing consumers to miss the sentinel,
// leak manual overrides, and require bespoke equality logic at every call site.
const NOOP = () => {};

type CallWithFallbackOptions<TResult> = {
    fallback?: TResult | ((error: unknown) => TResult);
    onError?: (error: unknown) => void;
};

/**
 * Invoke {@link action} while capturing synchronous failures and returning a
 * fallback value instead. Centralizes the "try, catch, fallback" pattern used
 * across environment configuration helpers so modules no longer hand-roll
 * boilerplate error handling each time they interact with configurable
 * callbacks. Callers can optionally supply {@link onError} to observe the
 * thrown error before the fallback is returned.
 *
 * @template TResult
 * @param {() => TResult} action Callback to invoke.
 * @param {{
 *   fallback?: TResult | ((error: unknown) => TResult),
 *   onError?: (error: unknown) => void
 * }} [options]
 * @returns {TResult | undefined} The callback result or the computed fallback
 *          when {@link action} throws.
 */
export function callWithFallback<TResult>(
    action: () => TResult,
    { fallback, onError }: CallWithFallbackOptions<TResult> = {}
) {
    const invoke = assertFunction(action, "action");
    const fallbackProvider: (error: unknown) => TResult =
        typeof fallback === "function" ? (fallback as (error: unknown) => TResult) : () => fallback;
    const errorHandler = onError === undefined ? undefined : assertFunction(onError, "onError");

    try {
        return invoke();
    } catch (error) {
        errorHandler?.(error);
        return fallbackProvider(error);
    }
}

export { NOOP as noop };
