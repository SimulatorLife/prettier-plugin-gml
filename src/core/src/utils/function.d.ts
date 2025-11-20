/**
 * Return the provided value without modification. Centralizes the identity
 * function used across helper modules so hot paths can reuse a single exported
 * implementation instead of allocating ad-hoc closures.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export declare function identity(value: any): any;
declare const NOOP: () => void;
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
export declare function callWithFallback(
    action: any,
    { fallback, onError }?: {}
): any;
export { NOOP as noop };
