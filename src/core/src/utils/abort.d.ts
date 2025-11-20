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
export declare function createAbortError(signal: any, fallbackMessage?: string): any;
export declare function isAbortError(value: any): boolean;
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
export declare function throwIfAborted(signal: any, fallbackMessage: any): void;
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
 * @returns {{ signal: AbortSignal | null, ensureNotAborted(): void }}
 *          Guard exposing the normalized signal and a checkpoint callback.
 */
export declare function createAbortGuard(options: any, { key, fallbackMessage }?: {}): {
    signal: any;
    ensureNotAborted: () => void;
};
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
export declare function resolveAbortSignalFromOptions(options: any, { key, fallbackMessage }?: {
    key?: string;
}): any;
