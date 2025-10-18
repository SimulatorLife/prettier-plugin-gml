export function createAbortError(signal, fallbackMessage) {
    if (!signal || signal.aborted !== true) {
        return null;
    }

    const { reason } = signal;
    if (reason instanceof Error) {
        return reason;
    }

    const message =
        reason == undefined
            ? fallbackMessage || "Operation aborted."
            : String(reason);
    const error = new Error(message || "Operation aborted.");
    if (!error.name) {
        error.name = "AbortError";
    }
    return error;
}

export function throwIfAborted(signal, fallbackMessage) {
    const error = createAbortError(signal, fallbackMessage);
    if (error) {
        throw error;
    }
}
