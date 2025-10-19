import {
    resolveAbortSignalFromOptions,
    throwIfAborted
} from "../../../shared/abort-utils.js";

/**
 * Construct a reusable guard that normalizes an AbortSignal derived from an
 * options bag and surfaces a convenience checker for repeatable cancellation
 * checkpoints. The helper consolidates the pattern spread across the project
 * index modules where every asynchronous workflow extracted the signal and
 * immediately re-ran the abort guard after each awaited boundary.
 *
 * Callers receive both the normalized signal (which may be `null` when the
 * options object omits one) and an `ensureNotAborted` callback that reuses the
 * same fallback message. The callback returns the signal so callers can chain
 * it inline when forwarding the signal to other helpers.
 *
 * @param {unknown} options Candidate options object carrying the signal.
 * @param {{
 *     key?: string | number | symbol,
 *     fallbackMessage?: string | null | undefined
 * }} [config]
 * @returns {{ signal: AbortSignal | null, ensureNotAborted(): AbortSignal | null }}
 *          Guard containing the normalized signal and a reusable checkpoint.
 */
export function createAbortGuard(options, { key, fallbackMessage } = {}) {
    const signal = resolveAbortSignalFromOptions(options, {
        key,
        fallbackMessage
    });

    function ensureNotAborted() {
        throwIfAborted(signal, fallbackMessage);
        return signal;
    }

    ensureNotAborted();

    return { signal, ensureNotAborted };
}

