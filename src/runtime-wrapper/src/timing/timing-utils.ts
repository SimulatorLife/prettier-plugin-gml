/**
 * Shared timing utilities for the runtime-wrapper workspace.
 *
 * This module provides high-resolution timing for duration measurements using performance.now()
 * while preserving Date.now() for wall-clock timestamps. The performance API provides
 * sub-millisecond precision and monotonic timestamps that are immune to system clock adjustments,
 * making it ideal for measuring patch application durations in hot-reload scenarios.
 *
 * These helpers are cross-cutting within the workspace and are used by both the runtime
 * and websocket layers, so they live in a dedicated timing domain rather than being
 * co-located with either sublayer's runtime or websocket implementation files.
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
