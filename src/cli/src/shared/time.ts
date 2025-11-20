const MILLISECOND_PER_SECOND = 1000;
const SUB_SECOND_THRESHOLD_TOLERANCE_MS = 1e-6;

interface VerboseFlagOptions {
    parsing?: boolean;
}

interface VerboseLogger {
    log?: (message: string) => void;
}

export interface VerboseDurationLoggerOptions {
    verbose?: VerboseFlagOptions;
    formatMessage?: string | ((duration: string) => string);
    now?: () => number;
    logger?: VerboseLogger;
}

export interface TimeSyncOptions {
    verbose?: VerboseFlagOptions;
    now?: () => number;
    logger?: VerboseLogger;
}

/**
 * Format the elapsed milliseconds since `startTime` into a human-friendly
 * string. Values under one second remain in milliseconds while longer durations
 * are rounded to a single decimal place in seconds.
 *
 * CLI workflows log these durations when verbose parsing output is enabled, so
 * the helper stays co-located with the rest of the CLI reporting primitives.
 *
 * @param {number} startTime Timestamp captured before the work began.
 * @param {() => number} [now] Function that returns the current timestamp.
 * @returns {string} Formatted duration label for logs and status messages.
 */
export function formatDuration(
    startTime: number,
    now: () => number = Date.now
): string {
    const deltaMs = now() - startTime;
    // High-resolution timers such as `performance.now()` can report values just
    // shy of the one-second boundary (for example, 999.9999999997) even when a
    // full second has elapsed. Treat anything within a tiny epsilon of the
    // threshold as a second so we do not log noisy millisecond strings.
    const isEffectivelySubSecond =
        deltaMs < MILLISECOND_PER_SECOND &&
        deltaMs < MILLISECOND_PER_SECOND - SUB_SECOND_THRESHOLD_TOLERANCE_MS;

    if (isEffectivelySubSecond) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / MILLISECOND_PER_SECOND).toFixed(1)}s`;
}

/**
 * Create a logger that reports how long an operation took when verbose parsing
 * output is enabled. Callers can provide either a static string or a factory to
 * customize the final message while reusing the CLI's duration formatting.
 *
 * @param {{
 *   verbose?: { parsing?: boolean },
 *   formatMessage?: string | ((duration: string) => string),
 *   now?: () => number,
 *   logger?: { log?: (message: string) => void }
 * }} [options]
 * @returns {() => void} A function that logs the elapsed duration when invoked.
 */
export function createVerboseDurationLogger({
    verbose,
    formatMessage,
    now = Date.now,
    logger = console
}: VerboseDurationLoggerOptions = {}): () => void {
    const startTime = now();

    return () => {
        if (!verbose?.parsing) {
            return;
        }

        const duration = formatDuration(startTime, now);
        const message =
            typeof formatMessage === "function"
                ? formatMessage(duration)
                : (formatMessage ?? `Completed in ${duration}.`);

        if (typeof logger?.log === "function") {
            logger.log(message);
        }
    };
}

/**
 * Run a synchronous callback while emitting verbose timing messages that match
 * the CLI's progress logging conventions. The helper mirrors the previous
 * shared implementation but now lives alongside the consumers that actually
 * depend on it.
 *
 * @template T
 * @param {string} label Human-readable description of the work being timed.
 * @param {() => T} callback Operation to execute.
 * @param {{
 *   verbose?: { parsing?: boolean },
 *   now?: () => number,
 *   logger?: { log?: (message: string) => void }
 * }} [options]
 *   Optional verbose flags, clock override, and logger replacement.
 * @returns {T} Whatever the callback returns.
 */
export function timeSync<TResult>(
    label: string,
    callback: () => TResult,
    { verbose, now, logger = console }: TimeSyncOptions = {}
): TResult {
    if (verbose?.parsing && typeof logger?.log === "function") {
        logger.log(`→ ${label}`);
    }

    const logCompletion = createVerboseDurationLogger({
        verbose,
        formatMessage: (duration) => `  ${label} completed in ${duration}.`,
        now,
        logger
    });
    const result = callback();

    logCompletion();

    return result;
}
