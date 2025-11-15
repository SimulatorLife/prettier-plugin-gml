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

// Shared noop fallback reused across helpers that expect to decorate a stable
// callable. The export must remain a singleton so downstream consumers can
// detect "was this callback customized?" via reference equality checks instead
// of threading sentinel flags around. Manual CLI flows (documented in
// docs/live-reloading-concept.md#manual-mode-cleanup-handoffs) stash this exact
// reference as the fallback `unsubscribe` handler, and semantic integrations
// such as `setReservedIdentifierMetadataLoader` rely on returning the shared
// function so their try/finally cleanups stay balanced. Swapping it for an
// inline closure—even one that does nothing—would cause those guards to miss the
// sentinel, leak manual overrides, and require every consumer to grow bespoke
// equality logic.
const NOOP = () => {};

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
export function callWithFallback(action, { fallback, onError } = {}) {
    const invoke = assertFunction(action, "action");
    const fallbackProvider =
        typeof fallback === "function"
            ? /** @type {(error: unknown) => TResult} */ (fallback)
            : () => /** @type {TResult} */ (fallback);
    const errorHandler =
        onError === undefined ? undefined : assertFunction(onError, "onError");

    try {
        return invoke();
    } catch (error) {
        errorHandler?.(error);
        return fallbackProvider(error);
    }
}

export { NOOP as noop };
