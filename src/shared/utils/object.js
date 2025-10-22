/**
 * Determine whether a value is a plain object (non-null object without an
 * Array instance). Some callers additionally require objects with prototypes
 * so the helper accepts an option mirroring that constraint.
 *
 * @param {unknown} value Candidate value to inspect.
 * @param {{ allowNullPrototype?: boolean }} [options]
 * @returns {value is object}
 */
export function isPlainObject(value, { allowNullPrototype = true } = {}) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    if (!allowNullPrototype && Object.getPrototypeOf(value) === null) {
        return false;
    }

    return true;
}

/**
 * Ensure the provided value is callable. Centralizing this guard keeps
 * defensive checks consistent across modules that accept callbacks while
 * preserving the specific error messages historically raised by each call
 * site.
 *
 * @param {unknown} value Candidate function to validate.
 * @param {string} name Descriptive name used when constructing the error.
 */
export function assertFunction(value, name) {
    if (typeof value !== "function") {
        throw new TypeError(`${name} must be a function`);
    }
}

/**
 * Check whether the provided value is an object-like reference. This mirrors
 * Lodash's definition, treating arrays and boxed primitives as object-like
 * while excluding `null` and primitive scalars. Functions are intentionally
 * omitted because the formatter exclusively passes structural metadata
 * objects through this guard.
 *
 * @param {unknown} value Candidate value to evaluate.
 * @returns {value is object} `true` when `value` can safely accept property access.
 */
export function isObjectLike(value) {
    return typeof value === "object" && value !== null;
}

/**
 * Validate that {@link value} is a plain object, throwing a descriptive
 * `TypeError` otherwise. Returns the original value to keep call sites terse
 * when destructuring or chaining normalization helpers.
 *
 * @template T extends object
 * @param {T | unknown} value Candidate value to validate.
 * @param {{
 *   name?: string,
 *   errorMessage?: string,
 *   allowNullPrototype?: boolean
 * }} [options]
 * @returns {T}
 */
export function assertPlainObject(
    value,
    { name = "value", errorMessage, allowNullPrototype = true } = {}
) {
    const defaultMessage = `${name} must be a plain object`;

    if (!isPlainObject(value, { allowNullPrototype })) {
        throw new TypeError(errorMessage ?? defaultMessage);
    }

    return value;
}

/**
 * Executes the provided callback when `value` is an object-like entity. This
 * avoids repeating the null and type checks that precede many object
 * operations. An alternate return value (or thunk) can be supplied for
 * non-object inputs to keep call sites expression-friendly.
 *
 * @template {object} TObject
 * @template TResult
 * @param {unknown} value The candidate value to inspect before invoking
 *                        `onObjectLike`.
 * @param {(object: TObject) => TResult} onObjectLike Callback run when `value`
 *                                                   passes the object-like
 *                                                   guard.
 * @param {(() => TResult) | TResult} [onNotObjectLike] Optional fallback that
 *                                                      runs (or is returned)
 *                                                      when the guard fails.
 * @returns {TResult | undefined} The result of `onObjectLike`, the fallback,
 *                                or `undefined` when no fallback is supplied.
 */
export function withObjectLike(value, onObjectLike, onNotObjectLike) {
    assertFunction(onObjectLike, "onObjectLike");

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
        for (const key of keys) {
            const value = object[key];

            if (value !== undefined && (acceptNull || value !== null)) {
                return value;
            }
        }

        return fallback;
    }

    // Avoid allocating a throwaway array when callers supply a single key.
    const value = object[keys];
    if (value !== undefined && (acceptNull || value !== null)) {
        return value;
    }

    return fallback;
}

/**
 * Determine whether `object` defines `key` as an own property. Defers to the
 * intrinsic `Object.prototype.hasOwnProperty` to avoid accidental shadowing by
 * user data, which regularly happens when processing user-authored AST nodes.
 *
 * @param {object} object Object to inspect for the property.
 * @param {string | number | symbol} key Property name or symbol.
 * @returns {boolean} `true` when the property exists directly on `object`.
 */
export function hasOwn(object, key) {
    return Object.hasOwn(object, key);
}

/**
 * Retrieve the entry associated with {@link key} from a `Map`-like store,
 * creating it with {@link initializer} when absent. Consolidates the
 * repetitive pattern of checking for an entry, constructing a default value,
 * and updating the map which appears throughout the CLI, project index, and
 * Feather transforms.
 *
 * The helper intentionally accepts `Map` and `WeakMap` instances (anything
 * implementing `get`, `set`, and `has`) so call sites can share the same
 * utility regardless of whether keys are primitive values or objects. The
 * initializer receives the key to support value derivation without requiring
 * surrounding closures.
 *
 * @template TKey
 * @template TValue
 * @param {{
 *     get(key: TKey): TValue | undefined;
 *     set(key: TKey, value: TValue): unknown;
 *     has(key: TKey): boolean;
 * }} store Map-like collection storing the entry.
 * @param {TKey} key Entry key to resolve.
 * @param {(key: TKey) => TValue} initializer Factory invoked when the entry is
 *        missing.
 * @returns {TValue} Existing or newly created entry.
 */
export function getOrCreateMapEntry(store, key, initializer) {
    if (
        !store ||
        typeof store.get !== "function" ||
        typeof store.set !== "function"
    ) {
        throw new TypeError("store must provide get and set functions");
    }

    if (typeof store.has !== "function") {
        throw new TypeError("store must provide a has function");
    }

    assertFunction(initializer, "initializer");

    if (store.has(key)) {
        return store.get(key);
    }

    const value = initializer(key);
    store.set(key, value);
    return value;
}
