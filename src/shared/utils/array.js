/**
 * Coerce a nullable or singular value into an array so downstream code can
 * iterate without sprinkling `== null` checks.
 *
 * @template T
 * @param {T | Array<T> | null | undefined} value
 * @returns {Array<T>} Normalized array representation of the provided value.
 */
// Reuse a frozen empty array to avoid allocating a new array on every call to
// `asArray`. The array is frozen so accidental mutations surface loudly during
// development instead of leaking shared state across callers.
const EMPTY_ARRAY = Object.freeze([]);

function toArrayFromIterable(values) {
    if (values == null) {
        return [];
    }

    if (Array.isArray(values)) {
        return values;
    }

    if (typeof values[Symbol.iterator] === "function") {
        return Array.from(values);
    }

    return [];
}

export function toArray(value) {
    if (value == undefined) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

/**
 * Return the provided value when it is already an array, otherwise yield an
 * empty array. Useful for treating optional array-like properties as a safe
 * iterable without introducing conditional branches at each call site.
 *
 * @template T
 * @param {unknown} value
 * @returns {Array<T>} Either the original array or a shared empty array.
 */
export function asArray(value) {
    return Array.isArray(value) ? value : EMPTY_ARRAY;
}

/**
 * Determine whether the provided value is an array containing at least one
 * element. This check mirrors the defensive guard pattern used throughout the
 * printers and parsers when iterating over optional collections.
 *
 * @param {unknown} value
 * @returns {value is Array<unknown>} `true` when `value` is a populated array.
 */
export function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}

/**
 * Create shallow clones of object-like entries in an array.
 *
 * This helper centralizes the "map and spread" pattern used throughout the
 * project index serialization logic so call sites stay focused on the
 * surrounding data shaping instead of re-implementing the cloning loop.
 * Non-object values are preserved as-is to mirror the behavior of
 * `Array#map` paired with object spreading while gracefully handling
 * unexpected primitives.
 *
 * @template T
 * @param {Array<T> | null | undefined} entries Collection of entries to clone.
 * @returns {Array<T>} Array containing shallow clones of object entries.
 */
export function cloneObjectEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const clones = new Array(entries.length);

    let index = 0;
    for (const entry of entries) {
        clones[index] =
            entry && typeof entry === "object" ? { ...entry } : entry;
        index += 1;
    }

    return clones;
}

/**
 * Create a new array containing the first occurrence of each unique value
 * encountered in the provided iterable while preserving the original order.
 *
 * @template T
 * @param {Iterable<T> | Array<T> | null | undefined} values
 * @param {Object} [options]
 * @param {boolean} [options.freeze=false]
 * @returns {Array<T> | ReadonlyArray<T>}
 */
export function uniqueArray(values, { freeze = false } = {}) {
    const uniqueValues = [...new Set(toArrayFromIterable(values))];
    return freeze ? Object.freeze(uniqueValues) : uniqueValues;
}

/**
 * Merge a collection of additional entries into a default array while
 * preserving order and eliminating duplicates. Callers can optionally supply a
 * coercion function to normalize raw entries before they are compared and a
 * key extractor to control how uniqueness is determined.
 *
 * @template T
 * @param {ReadonlyArray<T>} defaultValues
 * @param {Iterable<unknown> | null | undefined} additionalValues
 * @param {Object} [options]
 * @param {(value: unknown) => T | null | undefined} [options.coerce]
 * @param {(value: T) => unknown} [options.getKey]
 * @param {boolean} [options.freeze]
 * @returns {ReadonlyArray<T>}
 */
export function mergeUniqueValues(
    defaultValues,
    additionalValues,
    { coerce, getKey = (value) => value, freeze = true } = {}
) {
    const merged = Array.isArray(defaultValues) ? [...defaultValues] : [];
    const normalize = typeof coerce === "function" ? coerce : (value) => value;
    const seen = new Set();

    for (const element of merged) {
        seen.add(getKey(element));
    }

    const iterable =
        typeof additionalValues?.[Symbol.iterator] === "function"
            ? additionalValues
            : [];

    for (const rawValue of iterable) {
        const value = normalize(rawValue);
        if (value == null) {
            continue;
        }

        const key = getKey(value);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        merged.push(value);
    }

    return freeze ? Object.freeze(merged) : merged;
}
