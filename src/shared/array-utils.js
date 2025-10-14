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

export function toArray(value) {
    if (value == null) {
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
    if (values == null) {
        return freeze ? Object.freeze([]) : [];
    }

    const iterable = Array.isArray(values)
        ? values
        : typeof values[Symbol.iterator] === "function"
            ? Array.from(values)
            : [];

    const uniqueValues = [];
    const seen = new Set();

    for (const value of iterable) {
        if (seen.has(value)) {
            continue;
        }

        uniqueValues.push(value);
        seen.add(value);
    }

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
    const base = Array.isArray(defaultValues) ? defaultValues : [];
    const merged = base.slice();
    const seen = new Set(merged.map((value) => getKey(value)));
    const normalize = typeof coerce === "function" ? coerce : (value) => value;

    if (additionalValues) {
        for (const rawValue of additionalValues) {
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
    }

    return freeze ? Object.freeze(merged) : merged;
}
