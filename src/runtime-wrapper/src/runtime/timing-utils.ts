/**
 * Timing utilities for the runtime wrapper.
 *
 * This module provides high-resolution timing for duration measurements using performance.now()
 * while preserving Date.now() for wall-clock timestamps. The performance API provides
 * sub-millisecond precision and monotonic timestamps that are immune to system clock adjustments,
 * making it ideal for measuring patch application durations in hot-reload scenarios.
 */

/**
 * Returns a high-resolution timestamp suitable for measuring durations.
 * Uses performance.now() when available (browser/modern Node), falls back to Date.now().
 *
 * @returns Timestamp in milliseconds with sub-millisecond precision when supported
 */
export function getHighResolutionTime(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

/**
 * Returns the current wall-clock time as a Unix timestamp.
 * Always uses Date.now() for timestamps that represent absolute time.
 *
 * @returns Unix timestamp in milliseconds
 */
export function getWallClockTime(): number {
    return Date.now();
}

/**
 * Measures the duration of a synchronous operation.
 *
 * @param fn - The operation to measure
 * @returns The duration in milliseconds and the result of the operation
 */
export function measureDuration<T>(fn: () => T): { durationMs: number; result: T } {
    const start = getHighResolutionTime();
    const result = fn();
    const durationMs = getHighResolutionTime() - start;
    return { durationMs, result };
}
