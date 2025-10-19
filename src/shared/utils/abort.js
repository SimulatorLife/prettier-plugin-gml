import { getNonEmptyString } from "./string.js";

const DEFAULT_ABORT_MESSAGE = "Operation aborted.";
const ERROR_METADATA_KEYS = ["message", "name", "stack"];

function shouldReuseAbortReason(value) {
    if (value == null) {
        return false;
    }

    const valueType = typeof value;
    if (valueType !== "object" && valueType !== "function") {
        return false;
    }

    return (
        ERROR_METADATA_KEYS.some((key) => value[key] != null) || "cause" in value
    );
}

function toAbortMessage(value) {
    if (typeof value === "string") {
        return value;
    }

    if (value == null) {
        return null;
    }

    try {
        return String(value);
    } catch {
        return null;
    }
}

function normalizeAbortError(reason, fallbackMessage) {
    const fallback = getNonEmptyString(fallbackMessage) ?? DEFAULT_ABORT_MESSAGE;
    const error = shouldReuseAbortReason(reason)
        ? reason
        : new Error(getNonEmptyString(toAbortMessage(reason)) ?? fallback);

    if (!getNonEmptyString(error.name)) {
        error.name = "AbortError";
    }

    if (!getNonEmptyString(error.message)) {
        error.message = fallback;
    }

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

    return normalizeAbortError(signal.reason, fallbackMessage);
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
