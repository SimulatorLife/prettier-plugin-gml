const hasOwnProperty = Object.prototype.hasOwnProperty;

export function isObjectLike(value) {
    return typeof value === "object" && value !== null;
}

export function withObjectLike(value, onObjectLike, onNotObjectLike) {
    if (typeof onObjectLike !== "function") {
        throw new TypeError("onObjectLike must be a function");
    }

    if (!isObjectLike(value)) {
        return typeof onNotObjectLike === "function"
            ? onNotObjectLike()
            : onNotObjectLike;
    }

    return onObjectLike(value);
}

/**
 * Returns the first property value on the provided object that is neither
 * `undefined` nor `null`.
 *
 * Centralizes the common pattern of checking multiple option aliases (for
 * example public vs. internal `__`-prefixed keys) before falling back to a
 * default value. Callers can optionally accept `null` as a valid value when
 * `coalesceOption` is used outside of nullish coalescing chains.
 *
 * @template {string | number | symbol} TKey
 * @param {unknown} object Candidate object containing the properties.
 * @param {Array<TKey> | TKey} keys Property names to inspect in order.
 * @param {Object} [options]
 * @param {unknown} [options.fallback]
 * @param {boolean} [options.acceptNull=false]
 * @returns {unknown} The first matching property value or the fallback.
 */
export function coalesceOption(
    object,
    keys,
    { fallback, acceptNull = false } = {}
) {
    if (!isObjectLike(object)) {
        return fallback;
    }

    if (Array.isArray(keys)) {
        // Avoid allocating a throwaway array when callers pass a single key.
        for (const key of keys) {
            const value = object[key];

            if (value !== undefined && (acceptNull || value !== null)) {
                return value;
            }
        }

        return fallback;
    }

    const value = object[keys];
    if (value !== undefined && (acceptNull || value !== null)) {
        return value;
    }

    return fallback;
}

export function hasOwn(object, key) {
    return hasOwnProperty.call(object, key);
}
