/**
 * Format the elapsed milliseconds since `startTime` into a human-friendly
 * string. Values under one second remain in milliseconds while longer durations
 * are rounded to a single decimal place in seconds.
 *
 * @param {number} startTime Timestamp captured before the work began.
 * @returns {string} Formatted duration label for logs and status messages.
 */
export function formatDuration(startTime) {
    const deltaMs = Date.now() - startTime;
    if (deltaMs < 1000) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / 1000).toFixed(1)}s`;
}

/**
 * Create a logger that reports how long an operation took when verbose parsing
 * output is enabled. Callers can provide either a static string or a factory to
 * customise the final message while reusing the module's duration formatting.
 *
 * @param {{
 *   verbose?: { parsing?: boolean },
 *   formatMessage?: string | ((duration: string) => string)
 * }} [options]
 * @returns {() => void} A function that logs the elapsed duration when invoked.
 */
export function createVerboseDurationLogger({ verbose, formatMessage } = {}) {
    const startTime = Date.now();

    return () => {
        if (!verbose?.parsing) {
            return;
        }

        const duration = formatDuration(startTime);
        const message =
            typeof formatMessage === "function"
                ? formatMessage(duration)
                : (formatMessage ?? `Completed in ${duration}.`);

        console.log(message);
    };
}

/**
 * Run a synchronous callback while emitting verbose timing messages that match
 * the CLI's progress logging conventions.
 *
 * @template T
 * @param {string} label Human-readable description of the work being timed.
 * @param {() => T} callback Operation to execute.
 * @param {{ verbose?: { parsing?: boolean } }} [options] Optional CLI verbose flags.
 * @returns {T} Whatever the callback returns.
 */
export function timeSync(label, callback, { verbose } = {}) {
    if (verbose?.parsing) {
        console.log(`→ ${label}`);
    }

    const logCompletion = createVerboseDurationLogger({
        verbose,
        formatMessage: (duration) => `  ${label} completed in ${duration}.`
    });
    const result = callback();

    logCompletion();

    return result;
}
