/**
 * Convert an `AbortSignal` that has been triggered into an `Error` instance.
 *
 * Centralises the guard logic shared by the parser and CLI so call sites can
 * consistently surface `AbortError` instances while preserving any user-
 * supplied reason text. Non-aborted signals yield `null`, allowing callers to
 * short-circuit without additional branching.
 *
 * @param {AbortSignal | null | undefined} signal Signal to inspect for an
 *        aborted state.
 * @param {string | null | undefined} [fallbackMessage] Optional message used
 *        when the signal does not provide a reason value.
 * @returns {Error | null} `AbortError` compatible instance when aborted;
 *          otherwise `null`.
 */
const DEFAULT_ABORT_MESSAGE = "Operation aborted.";

export function createAbortError(signal, fallbackMessage = DEFAULT_ABORT_MESSAGE) {
    if (!signal || signal.aborted !== true) {
        return null;
    }

    const { reason } = signal;
    if (reason instanceof Error) {
        return reason;
    }

    const isReasonMissing = reason === undefined || reason === null;
    const fallback = fallbackMessage || DEFAULT_ABORT_MESSAGE;
    const message = isReasonMissing ? fallback : String(reason);
    const error = new Error(message || DEFAULT_ABORT_MESSAGE);
    if (!error.name) {
        error.name = "AbortError";
    }
    return error;
}

/**
 * Throw an `AbortError` when the provided signal has been cancelled.
 *
 * Mirrors the semantics of {@link createAbortError} while providing a
 * convenience wrapper that matches the rest of the shared utilities.
 *
 * @param {AbortSignal | null | undefined} signal Signal guarding the work.
 * @param {string | null | undefined} [fallbackMessage] Optional replacement
 *        message when the signal omits a reason.
 * @returns {void}
 */
export function throwIfAborted(signal, fallbackMessage) {
    const error = createAbortError(signal, fallbackMessage);
    if (error) {
        throw error;
    }
}
