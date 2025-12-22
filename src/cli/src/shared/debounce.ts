/**
 * Debounce utility for delaying function execution until after a quiet period.
 *
 * This module provides a debouncer that prevents a function from being called
 * until a specified delay has passed since the last invocation attempt. Useful
 * for batching rapid successive calls (e.g., file system events during editing).
 */

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

    const debounced = (...args: TArgs): void => {
        pendingArgs = args;

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            const argsToUse = pendingArgs;
            pendingArgs = null;

            if (argsToUse !== null) {
                try {
                    fn(...argsToUse);
                } catch {
                    // Silently ignore errors to prevent uncaught exceptions
                }
            }
        }, delayMs);
    };

    debounced.flush = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        const argsToUse = pendingArgs;
        pendingArgs = null;

        if (argsToUse !== null) {
            try {
                fn(...argsToUse);
            } catch {
                // Silently ignore errors to prevent uncaught exceptions
            }
        }
    };

    debounced.cancel = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        pendingArgs = null;
    };

    debounced.isPending = (): boolean => {
        return timeoutId !== null;
    };

    return debounced;
}
