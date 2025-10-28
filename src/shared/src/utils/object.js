/**
 * Determine whether a value is a plain object (non-null object without an
 * Array instance). Some callers additionally require objects with prototypes
 * so the helper accepts an option mirroring that constraint.
 *
 * @param {unknown} value Candidate value to inspect.
 * @param {{ allowNullPrototype?: boolean }} [options]
 * @returns {value is object} `true` when {@link value} is a plain object.
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
 * @template {Function} TFunction
 * @param {TFunction | unknown} value Candidate function to validate.
 * @param {string} name Descriptive name used when constructing the error.
 * @returns {TFunction} The validated function reference.
 */
export function assertFunction(value, name, { errorMessage } = {}) {
    if (typeof value === "function") {
        return /** @type {TFunction} */ (value);
    }

    const message =
        errorMessage ??
        (typeof name === "string" && name.length > 0
            ? `${name} must be a function.`
            : "Value must be a function.");

    throw new TypeError(message);
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
 * Resolve a helper override from an optional helper bag while preserving the
 * original fallback behaviour. Consolidates the repeated guard pattern used
 * across transforms that support caller-provided helpers so each site no
 * longer hand-rolls `typeof` checks for every property.
 *
 * @template {Function} THelper
 * @param {unknown} helpers Candidate helper bag supplied by the caller.
 * @param {string | number | symbol} key Property name housing the override.
 * @param {THelper} fallback Default helper used when no override is supplied.
 * @returns {THelper}
 */
export function resolveHelperOverride(helpers, key, fallback) {
    const normalizedFallback = assertFunction(
        fallback,
        typeof key === "string" && key.length > 0
            ? `${key.toString()} helper`
            : "helper override"
    );

    const hasHelperOverrides =
        helpers && (typeof helpers === "function" || isObjectLike(helpers));

    if (!hasHelperOverrides) {
        return normalizedFallback;
    }

    const candidate = /** @type {Record<string | number | symbol, unknown>} */ (
        helpers
    )[key];

    if (typeof candidate !== "function") {
        return normalizedFallback;
    }

    return /** @type {THelper} */ (candidate);
}

const objectPrototypeToString = Object.prototype.toString;
const OBJECT_TAG_PATTERN = /^\[object ([^\]]+)\]$/;

/**
 * Determine whether the provided value is an object or function reference.
 *
 * Several modules accept host-provided options or dependency containers that
 * may be implemented as objects or callable factories. Centralizing the guard
 * keeps their defensive checks aligned while ensuring `null` and primitives
 * are rejected consistently.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {boolean} `true` when {@link value} can be treated as an object or function.
 */
export function isObjectOrFunction(value) {
    if (value == null) {
        return false;
    }

    const type = typeof value;
    if (type === "object") {
        return true;
    }

    return type === "function";
}

/**
 * Resolve the built-in `Object.prototype.toString` tag name for {@link value}.
 *
 * Normalizes the repeated guard logic used across CLI modules when formatting
 * diagnostic messages so they can consistently describe host-provided
 * structures (for example `Map`, `Set`, or typed arrays) without rewriting the
 * pattern matching at each call site. Plain objects default to `null` to mirror
 * the historical behaviour of the existing error formatters.
 *
 * @param {unknown} value Candidate value to inspect.
 * @param {{ includePlainObject?: boolean }} [options]
 * @param {boolean} [options.includePlainObject=false]
 * @returns {string | null} Tag name when resolved, otherwise `null`.
 */
export function getObjectTagName(value, { includePlainObject = false } = {}) {
    if (value === null) {
        return null;
    }

    const type = typeof value;
    if (type !== "object" && type !== "function") {
        return null;
    }

    const tag = objectPrototypeToString.call(value);
    const match = OBJECT_TAG_PATTERN.exec(tag);
    if (!match) {
        return null;
    }

    const [, tagName] = match;
    if (!tagName) {
        return null;
    }

    if (!includePlainObject && tagName === "Object") {
        return null;
    }

    return tagName;
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
 * Execute {@link onDefined} when {@link value} is not `undefined`. Centralizes
 * the guard around optional values so call sites can focus on their core logic
 * instead of repeating `!== undefined` checks and callback validation.
 *
 * Callers can optionally supply {@link onUndefined} which mirrors the fallback
 * semantics of {@link withObjectLike}, accepting either a thunk or a direct
 * value. When omitted the helper returns `undefined` to keep its behaviour
 * aligned with existing conditional assignments in the codebase.
 *
 * @template TValue
 * @template TResult
 * @param {TValue | undefined} value Candidate value to inspect.
 * @param {(value: TValue) => TResult} onDefined Callback invoked when
 *        {@link value} is defined.
 * @param {(() => TResult) | TResult} [onUndefined] Optional fallback returned
 *        (or invoked) when {@link value} is `undefined`.
 * @returns {TResult | undefined}
 */
export function withDefinedValue(value, onDefined, onUndefined) {
    assertFunction(onDefined, "onDefined");

    if (value === undefined) {
        return typeof onUndefined === "function" ? onUndefined() : onUndefined;
    }

    return onDefined(value);
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
 * @param {object} [options]
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

    const normalizedKeys = Array.isArray(keys)
        ? keys
        : keys == null
          ? []
          : [keys];

    for (const key of normalizedKeys) {
        const value = object[key];

        if (value !== undefined && (acceptNull || value !== null)) {
            return value;
        }
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

/**
 * Increment the numeric value stored at {@link key} inside a Map-like
 * collection, defaulting missing or non-numeric entries to {@link fallback}.
 * Consolidates the "read, coerce, increment, write" pattern used throughout
 * the CLI and identifier case modules so callers don't have to repeat the
 * guards around `Map#get`/`Map#set` or numeric coercion.
 *
 * @param {{ get(key: any): unknown; set(key: any, value: number): unknown }} store
 *        Map-like collection providing `get` and `set` methods.
 * @param {unknown} key Entry key whose numeric value should be incremented.
 * @param {number | string | null | undefined} [amount=1] Amount to add to the
 *        stored value. Non-finite values are treated as zero so accidental
 *        `NaN` inputs do not corrupt counters.
 * @param {{ fallback?: number | string | null | undefined }} [options]
 *        Optional configuration bag.
 * @param {number | string | null | undefined} [options.fallback=0] Value to use
 *        when the current entry is missing or not a finite number.
 * @returns {number} The incremented numeric value stored in the map.
 */
export function incrementMapValue(
    store,
    key,
    amount = 1,
    { fallback = 0 } = {}
) {
    if (
        !store ||
        typeof store.get !== "function" ||
        typeof store.set !== "function"
    ) {
        throw new TypeError("store must provide get and set functions");
    }

    const delta = toFiniteNumber(amount) ?? 0;
    const base =
        toFiniteNumber(store.get(key)) ?? toFiniteNumber(fallback) ?? 0;

    const next = base + delta;
    store.set(key, next);
    return next;
}

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
