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
        ERROR_METADATA_KEYS.some((key) => value[key] != null) ||
        "cause" in value
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
    const fallback =
        getNonEmptyString(fallbackMessage) ?? DEFAULT_ABORT_MESSAGE;
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

/**
 * Construct a reusable guard around an {@link AbortSignal} extracted from an
 * options bag. The guard normalizes the signal once and exposes a convenience
 * callback that can be reused at every async boundary to surface a consistent
 * {@link AbortError} when cancellation occurs.
 *
 * The helper mirrors the pattern previously implemented in the project index
 * layer where callers repeatedly pulled the signal from `options`, checked for
 * cancellation, and forwarded the same fallback message. Centralizing the
 * guard alongside the rest of the abort helpers keeps the behaviour consistent
 * across feature areas while making the utility discoverable to other
 * long-running workflows.
 *
 * @param {unknown} options Candidate options object that may expose a signal.
 * @param {{
 *     key?: string | number | symbol,
 *     fallbackMessage?: string | null | undefined
 * }} [config]
 * @returns {{ signal: AbortSignal | null, ensureNotAborted(): AbortSignal | null }}
 *          Guard exposing the normalized signal and a checkpoint callback.
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

function isAbortSignalLike(value) {
    return (
        value != null &&
        (typeof value === "object" || typeof value === "function") &&
        typeof value.aborted === "boolean"
    );
}

/**
 * Extract an `AbortSignal` from an options bag while ensuring it has not
 * already been cancelled. This consolidates the repetitive guard logic spread
 * throughout the project index helpers where every entry point previously
 * reimplemented the same `options?.signal ?? null` pattern.
 *
 * Callers receive either the validated signal instance or `null` when the
 * options bag does not expose a usable signal. Any pre-aborted signals raise an
 * `AbortError` using the same fallback semantics as {@link throwIfAborted} to
 * keep error reporting consistent.
 *
 * @param {unknown} options Candidate options object that may carry a signal.
 * @param {{
 *     key?: string | number | symbol,
 *     fallbackMessage?: string | null | undefined
 * }} [config]
 * @param {string | number | symbol} [config.key="signal"] Property name used
 *        to retrieve the signal from {@link options}.
 * @param {string | null | undefined} [config.fallbackMessage] Optional message
 *        forwarded when surfacing an `AbortError` for an already-cancelled
 *        signal.
 * @returns {AbortSignal | null} Normalized signal instance or `null` when the
 *          options object does not supply one.
 */
export function resolveAbortSignalFromOptions(
    options,
    { key = "signal", fallbackMessage } = {}
) {
    if (
        options == null ||
        (typeof options !== "object" && typeof options !== "function")
    ) {
        return null;
    }

    const candidate = options[key] ?? null;
    if (!isAbortSignalLike(candidate)) {
        return null;
    }

    throwIfAborted(candidate, fallbackMessage);
    return candidate;
}
