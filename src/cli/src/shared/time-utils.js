/**
 * Format the elapsed milliseconds since `startTime` into a human-friendly
 * string. Values under one second remain in milliseconds while longer durations
 * are rounded to a single decimal place in seconds.
 *
 * @param {number} startTime Timestamp captured before the work began.
 * @param {() => number} [now] Function that returns the current timestamp.
 * @returns {string} Formatted duration label for logs and status messages.
 */
export function formatDuration(startTime, now = Date.now) {
    const deltaMs = now() - startTime;
    if (deltaMs < 1000) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / 1000).toFixed(1)}s`;
}

/**
 * Create a logger that reports how long an operation took when verbose parsing
 * output is enabled. Callers can provide either a static string or a factory to
 * customize the final message while reusing the module's duration formatting.
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
} = {}) {
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
 * the CLI's progress logging conventions.
 *
 * @template T
 * @param {string} label Human-readable description of the work being timed.
 * @param {() => T} callback Operation to execute.
 * @param {{
 *   verbose?: { parsing?: boolean },
 *   now?: () => number,
 *   logger?: { log?: (message: string) => void }
 * }} [options]
 *   Optional CLI verbose flags, clock override, and logger replacement.
 * @returns {T} Whatever the callback returns.
 */
export function timeSync(
    label,
    callback,
    { verbose, now, logger = console } = {}
) {
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
