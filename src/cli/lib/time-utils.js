import { formatDuration } from "../../shared/number-utils.js";

/**
 * Create a logger that reports how long an operation took when verbose parsing
 * output is enabled. Callers can provide either a static string or a factory to
 * customise the final message while reusing the shared duration formatting.
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
