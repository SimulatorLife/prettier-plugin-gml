/**
 * Append {@link value} to {@link collection}, tolerating accumulator values
 * that have not been initialized yet or that were previously provided as a
 * single scalar. Centralizes the guard logic used by Commander option
 * collectors so each command can focus on its domain-specific normalization
 * without re-implementing array wrapping semantics.
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
