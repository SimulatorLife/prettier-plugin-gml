/**
 * Normalize the accumulator used by CLI option collectors so commands can
 * accept either a scalar flag (for example `--tag alpha`) or repeated
 * invocations (`--tag alpha --tag beta`). The helper mirrors Commander’s
 * accumulation semantics and is reused by multiple modules that surface
 * collection-style options.
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
