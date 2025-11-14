/**
 * Normalize the accumulator used by CLI option collectors so commands can
 * accept either a scalar flag (for example `--tag alpha`) or repeated
 * invocations (`--tag alpha --tag beta`). The helper mirrors Commander's
 * accumulation semantics and is reused by modules that surface collection-style
 * options.
 *
 * The routine originally lived under the shared array utilities even though it
 * only serves the CLI layer. Relocating it keeps the shared package focused on
 * cross-environment helpers while the CLI exposes command-runner ergonomics.
 *
 * @template T
 * @param {T} value Value to append to the collection.
 * @param {Array<T> | T | undefined} collection Current accumulator provided by
 *        Commander (or similar collectors).
 * @returns {Array<T>} Array containing both prior entries and {@link value}.
 */
export function appendToCollection(value, collection) {
    if (collection === undefined) {
        return [value];
    }

    if (Array.isArray(collection)) {
        collection.push(value);
        return collection;
    }

    return [collection, value];
}
