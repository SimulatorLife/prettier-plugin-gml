/**
 * Abort-safe retry helpers for transient empty file reads.
 *
 * Filesystem watch events can fire while an editor is still writing.  Editors
 * often truncate a file to zero bytes before writing the new content, creating
 * a brief window where a read returns an empty string.  The helpers here retry
 * the read up to a small number of times so callers do not misinterpret that
 * transient window as a permanent transpilation failure.
 *
 * Both helpers accept an optional `AbortSignal`.  When the signal fires, the
 * underlying `setTimeout` is cleared immediately and the pending promise is
 * rejected with an `AbortError`, so no timer resource outlives the owning
 * operation.
 */

import { readFile } from "node:fs/promises";

/** Maximum number of read attempts before returning the (possibly empty) content. */
export const TRANSIENT_EMPTY_FILE_READ_RETRY_COUNT = 4;

/** Milliseconds to wait between empty-content retries. */
export const TRANSIENT_EMPTY_FILE_READ_RETRY_DELAY_MS = 25;

/**
 * Normalise the abort reason carried by a signal into a proper `Error` instance.
 *
 * `AbortController.abort()` defaults to a `DOMException("AbortError")` on
 * Node ≥ 17.3, so `signal.reason` is usually already an `Error`.  Callers may
 * supply a custom reason that is not an `Error`, however, and the ESLint rule
 * `@typescript-eslint/prefer-promise-reject-errors` requires that Promise
 * rejections always receive an `Error`.  This helper satisfies that rule while
 * preserving the original reason when it already is an `Error`.
 *
 * @param {AbortSignal} signal A signal that has already fired (`signal.aborted === true`).
 * @returns {Error} The abort reason as an `Error` instance.
 */
function toAbortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException(
              typeof signal.reason === "string" ? signal.reason : "The operation was aborted.",
              "AbortError"
          );
}

/**
 * Return a Promise that resolves after `durationMs` milliseconds.
 *
 * When `signal` is provided, the backing `setTimeout` is cleared as soon as the
 * signal fires, preventing dangling timers from keeping the Node.js event loop
 * alive after the owning operation has been cancelled. The promise is rejected
 * with a normalised `AbortError` so callers can distinguish deliberate
 * cancellation from other failures.
 *
 * Without abort support, a pending timer created by this function would survive
 * past the caller's lifetime and keep the event loop open until it fired, even
 * after an {@link AbortController} was used to signal shutdown. This is
 * particularly visible in test mode, where `process.exit()` is not called after
 * cleanup and any remaining timers stall the test runner.
 *
 * @param {number} durationMs Milliseconds to wait before resolving.
 * @param {AbortSignal | null} [signal] Optional cancellation token.
 * @returns {Promise<void>} Resolves after the delay, or rejects with an `AbortError` on abort.
 */
export function delayFileReadRetry(durationMs: number, signal?: AbortSignal | null): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
            reject(toAbortError(signal));
            return;
        }

        const id = setTimeout(resolve, durationMs);

        if (signal) {
            // Clear the timer and reject the promise as soon as the signal fires.
            // { once: true } ensures the listener is automatically removed after
            // it fires, preventing a secondary listener leak.
            const onAbort = () => {
                clearTimeout(id);
                reject(toAbortError(signal));
            };
            signal.addEventListener("abort", onAbort, { once: true });
        }
    });
}

/**
 * Read a file's text content, retrying briefly when the file appears
 * transiently empty (a window that editors can produce while writing).
 *
 * The optional `signal` is forwarded to every inter-retry delay so that a
 * pending retry is cancelled immediately when the caller aborts. The rejection
 * propagates to the caller, allowing it to distinguish intentional cancellation
 * from unexpected failures.
 *
 * @param {string} filePath Absolute or relative path to the file.
 * @param {AbortSignal | null} [signal] Optional cancellation token.
 * @returns {Promise<string>} File contents as a UTF-8 string.
 * @throws {NodeJS.ErrnoException} When the file cannot be read.
 * @throws Rejects with an `AbortError` when `signal` fires during a retry delay.
 */
export function readSourceFileWithTransientEmptyRetry(filePath: string, signal?: AbortSignal | null): Promise<string> {
    const readAttempt = async (attempt: number): Promise<string> => {
        const content = await readFile(filePath, "utf8");
        const isFinalAttempt = attempt >= TRANSIENT_EMPTY_FILE_READ_RETRY_COUNT - 1;
        if (content.length > 0 || isFinalAttempt) {
            return content;
        }

        await delayFileReadRetry(TRANSIENT_EMPTY_FILE_READ_RETRY_DELAY_MS, signal);
        return readAttempt(attempt + 1);
    };

    return readAttempt(0);
}
