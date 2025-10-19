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
function isErrorLike(value) {
    if (value == null) {
        return false;
    }

    const valueType = typeof value;
    if (valueType !== "object" && valueType !== "function") {
        return false;
    }

    if ("message" in value && value.message != null) {
        return true;
    }

    if ("name" in value && value.name != null) {
        return true;
    }

    if ("stack" in value && value.stack != null) {
        return true;
    }

    return "cause" in value;
}

function ensureAbortErrorMetadata(error, fallbackMessage) {
    if (typeof error.name !== "string" || error.name.length === 0) {
        error.name = "AbortError";
    }

    if (typeof error.message !== "string" || error.message.length === 0) {
        const message = fallbackMessage || "Operation aborted.";
        if (message) {
            error.message = message;
        }
    }

    return error;
}

export function createAbortError(signal, fallbackMessage) {
    if (!signal || signal.aborted !== true) {
        return null;
    }

    const { reason } = signal;
    if (isErrorLike(reason)) {
        return ensureAbortErrorMetadata(reason, fallbackMessage);
    }

    const message =
        reason == undefined
            ? fallbackMessage || "Operation aborted."
            : String(reason);
    const error = new Error(message || "Operation aborted.");
    return ensureAbortErrorMetadata(error, fallbackMessage);
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
