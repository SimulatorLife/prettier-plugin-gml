import { formatDuration } from "../../shared/number-utils.js";

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

    const startTime = Date.now();
    const result = callback();

    if (verbose?.parsing) {
        console.log(`  ${label} completed in ${formatDuration(startTime)}.`);
    }

    return result;
}
