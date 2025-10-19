import { getNonEmptyString } from "./string.js";

const DEFAULT_ABORT_MESSAGE = "Operation aborted.";
const ERROR_METADATA_KEYS = ["message", "name", "stack"];

function hasErrorMetadata(value) {
    if (value == null) {
        return false;
    }

    const valueType = typeof value;
    if (valueType !== "object" && valueType !== "function") {
        return false;
    }

    if (ERROR_METADATA_KEYS.some((key) => key in value && value[key] != null)) {
        return true;
    }

    return "cause" in value;
}

function ensureAbortErrorMetadata(error, fallbackMessage) {
    if (!getNonEmptyString(error.name)) {
        error.name = "AbortError";
    }

    const fallback =
        getNonEmptyString(fallbackMessage) ?? DEFAULT_ABORT_MESSAGE;
    error.message = getNonEmptyString(error.message) ?? fallback;
    return error;
}

/**
 * Convert an `AbortSignal` that has been triggered into an `Error` instance.
 *
 * Centralizes the guard logic shared by the parser and CLI so call sites can
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
export function createAbortError(
    signal,
    fallbackMessage = DEFAULT_ABORT_MESSAGE
) {
    if (!signal || signal.aborted !== true) {
        return null;
    }

    const fallback =
        getNonEmptyString(fallbackMessage) ?? DEFAULT_ABORT_MESSAGE;
    const { reason } = signal;

    if (hasErrorMetadata(reason)) {
        return ensureAbortErrorMetadata(reason, fallback);
    }

    const message =
        reason === undefined || reason === null ? null : String(reason);
    const error = new Error(getNonEmptyString(message) ?? fallback);
    return ensureAbortErrorMetadata(error, fallback);
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
