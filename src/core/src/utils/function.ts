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
export function identity<T>(value: T): T {
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
    const invoke = assertFunction<() => TResult>(action, "action");
    const fallbackProvider: (error: unknown) => TResult | undefined =
        typeof fallback === "function" ? (error) => (fallback as (error: unknown) => TResult)(error) : () => fallback;
    const errorHandler =
        onError === undefined ? undefined : assertFunction<(error: unknown) => void>(onError, "onError");

    try {
        return invoke();
    } catch (error) {
        errorHandler?.(error);
        return fallbackProvider(error);
    }
}

export { NOOP as noop };

/**
 * Represents a debounced function with cleanup capabilities.
 */
export interface DebouncedFunction<TArgs extends Array<unknown>> {
    /**
     * Invoke the debounced function. The actual execution will be delayed
     * until the quiet period expires.
     */
    (...args: TArgs): void;

    /**
     * Cancel any pending execution and invoke immediately if pending.
     */
    flush(): void;

    /**
     * Cancel any pending execution without invoking.
     */
    cancel(): void;

    /**
     * Check if there is a pending execution.
     */
    isPending(): boolean;
}

/**
 * Creates a debounced version of a function that delays execution until after
 * a specified delay has elapsed since the last invocation.
 *
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds to wait before executing
 * @returns Debounced function with flush, cancel, and isPending methods
 *
 * @example
 * ```ts
 * const debouncedSave = debounce((filePath: string) => {
 *   console.log('Saving', filePath);
 * }, 200);
 *
 * debouncedSave('/path/to/file.gml'); // Scheduled
 * debouncedSave('/path/to/file.gml'); // Cancels previous, schedules new
 * debouncedSave('/path/to/file.gml'); // Cancels previous, schedules new
 * // After 200ms of quiet, saves once with the last arguments
 *
 * // Force immediate execution
 * debouncedSave.flush();
 *
 * // Cancel pending execution
 * debouncedSave.cancel();
 * ```
 */
export function debounce<TArgs extends Array<unknown>>(
    fn: (...args: TArgs) => void,
    delayMs: number
): DebouncedFunction<TArgs> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let pendingArgs: TArgs | null = null;

    const clearPendingTimer = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    const invokePending = (): void => {
        const argsToUse = pendingArgs;
        pendingArgs = null;

        if (argsToUse === null) {
            return;
        }

        try {
            fn(...argsToUse);
        } catch {
            // Silently ignore errors to prevent uncaught exceptions from
            // propagating out of the debounced execution. If the wrapped
            // function throws, the error is swallowed to keep the debounce
            // mechanism stable and avoid crashing the host process. Callers
            // should handle errors inside their own function if recovery is needed.
        }
    };

    const debounced = (...args: TArgs): void => {
        pendingArgs = args;
        clearPendingTimer();

        timeoutId = setTimeout(() => {
            timeoutId = null;
            invokePending();
        }, delayMs);
    };

    debounced.flush = (): void => {
        clearPendingTimer();
        invokePending();
    };

    debounced.cancel = (): void => {
        clearPendingTimer();
        pendingArgs = null;
    };

    debounced.isPending = (): boolean => {
        return timeoutId !== null;
    };

    return debounced;
}
