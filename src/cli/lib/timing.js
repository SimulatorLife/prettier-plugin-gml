import { formatDuration } from "../../shared/number-utils.js";

/**
 * Log synchronous timing information for CLI tasks when verbose output is
 * enabled. This mirrors the previous helper that lived in shared utilities, but
 * is colocated with the CLI-specific logging conventions and dependencies.
 *
 * @param {string} label Descriptive label for the work being measured.
 * @param {Function} fn Callback that performs the work and returns a result.
 * @param {{ verbose: { parsing: boolean } }} context CLI verbosity settings.
 * @returns {unknown} Result returned by {@link fn}.
 */
export function timeSync(label, fn, { verbose }) {
    if (verbose?.parsing) {
        console.log(`→ ${label}`);
    }

    const startTime = Date.now();
    const result = fn();

    if (verbose?.parsing) {
        console.log(`  ${label} completed in ${formatDuration(startTime)}.`);
    }

    return result;
}
