// Reuse a frozen empty array to avoid allocating a new array on every call to
// `asArray`. The array is frozen so accidental mutations surface loudly during
// development instead of leaking shared state across callers.
const EMPTY_ARRAY = Object.freeze([]);

export function toArrayFromIterable(values) {
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

/**
 * Coerce a nullable or singular value into an array so downstream code can
 * iterate without sprinkling `== null` checks.
 *
 * @template T
 * @param {T | Array<T> | null | undefined} value
 * @returns {Array<T>} Normalized array representation of the provided value.
 */
export function toArray(value) {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

/**
 * Assert that the provided value is an array. Centralizes the guard so callers
 * can reuse the same error messaging while keeping their control flow focused
 * on the surrounding logic. Optionally tolerates `null`/`undefined` inputs by
 * returning an empty array when {@link allowNull} is enabled.
 *
 * @template T
 * @param {Array<T> | null | undefined | unknown} value Candidate value to validate.
 * @param {{
 *   name?: string,
 *   allowNull?: boolean,
 *   errorMessage?: string
 * }} [options]
 * @returns {Array<T>} The validated array or a fresh empty array when
 *                     `allowNull` permits nullable inputs.
 */
export function assertArray(
    value,
    { name = "value", allowNull = false, errorMessage } = {}
) {
    if (Array.isArray(value)) {
        return value;
    }

    if (allowNull && value == null) {
        return [];
    }

    const message = errorMessage ?? `${name} must be provided as an array.`;
    throw new TypeError(message);
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
 * Normalize a candidate array so callers can safely mutate the result without
 * repeating null checks and array guards. When the provided value is already
 * an array, the original reference is returned to preserve identity. All other
 * values fall back to a fresh empty array so mutations stay local to the call
 * site. Callers can opt into shallow cloning when they need to decouple from
 * the original array instance.
 *
 * @template T
 * @param {Array<T> | null | undefined | unknown} value
 * @param {{ clone?: boolean }} [options]
 * @param {boolean} [options.clone=false]
 * @returns {Array<T>} Mutably safe array representation of {@link value}.
 */
export function toMutableArray(value, { clone = false } = {}) {
    if (!Array.isArray(value)) {
        return [];
    }

    return clone ? [...value] : value;
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
 * Checks whether {@link index} can be safely used to read from {@link container}
 * without tripping over non-array parents or non-numeric indices. Centralizes
 * the guard so array-manipulating helpers can exit early before attempting to
 * splice or access unknown structures.
 *
 * @param {unknown} container Potential array owner of {@link index}.
 * @param {unknown} index Candidate index pointing into {@link container}.
 * @returns {index is number} `true` when {@link container} is an array and the
 *                            index is a numeric offset.
 */
export function isArrayIndex(container, index) {
    if (!Array.isArray(container)) {
        return false;
    }

    if (typeof index !== "number") {
        return false;
    }

    return Number.isInteger(index);
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

    return entries.map((entry) =>
        entry && typeof entry === "object" ? { ...entry } : entry
    );
}

/**
 * Create a new array containing the first occurrence of each unique value
 * encountered in the provided iterable while preserving the original order.
 *
 * @template T
 * @param {Iterable<T> | Array<T> | null | undefined} values
 * @param {{ freeze?: boolean }} [options]
 * @param {boolean} [options.freeze=false]
 * @returns {Array<T> | ReadonlyArray<T>}
 */
export function uniqueArray(values, { freeze = false } = {}) {
    const uniqueValues = [...new Set(toArrayFromIterable(values))];
    return freeze ? Object.freeze(uniqueValues) : uniqueValues;
}

/**
 * Append {@link value} to {@link array} when it is not already present.
 *
 * Centralizes the inclusion guard used throughout the project index and
 * resource analysis modules so callers can focus on their domain logic while
 * keeping duplicate prevention consistent. The helper mirrors the semantics of
 * `Array#includes`, including `NaN` handling, and returns a boolean so hot
 * paths can detect when a new entry was appended.
 *
 * @template T
 * @param {Array<T>} array Array that should receive {@link value} when absent.
 * @param {T} value Candidate value to append.
 * @param {{ isEqual?: (existing: T, candidate: T) => boolean }} [options]
 *        Optional equality comparator for cases where strict equality is not
 *        sufficient.
 * @returns {boolean} `true` when the value was appended.
 */
export function pushUnique(array, value, { isEqual } = {}) {
    if (!Array.isArray(array)) {
        throw new TypeError("pushUnique requires an array to append to.");
    }

    const hasMatch =
        typeof isEqual === "function"
            ? array.some((entry) => isEqual(entry, value))
            : array.includes(value);

    if (!hasMatch) {
        array.push(value);
        return true;
    }

    return false;
}

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

/**
 * Merge a collection of additional entries into a default array while
 * preserving order and eliminating duplicates. Callers can optionally supply a
 * coercion function to normalize raw entries before they are compared and a
 * key extractor to control how uniqueness is determined.
 *
 * @template T
 * @param {ReadonlyArray<T>} defaultValues
 * @param {Iterable<unknown> | null | undefined} additionalValues
 * @param {{
 *   coerce?: (value: unknown) => T | null | undefined,
 *   getKey?: (value: T) => unknown,
 *   freeze?: boolean
 * }} [options]
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

    for (const rawValue of toArrayFromIterable(additionalValues)) {
        const value = normalize(rawValue);
        if (value === null || value === undefined) {
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
