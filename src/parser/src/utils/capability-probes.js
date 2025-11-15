import { isObjectLike } from "../utils/object.js";

/**
 * Determine whether {@link value} exposes a callable member named
 * {@link property}. Several capability probes rely on this check to detect
 * RegExp, Map, and Set lookalikes along with parser-specific error facades, so
 * centralizing the logic ensures each module makes consistent decisions.
 *
 * @param {unknown} value Candidate object to inspect.
 * @param {string | symbol} property Property name to look up on {@link value}.
 * @returns {boolean} `true` when the property exists and is callable.
 */
export function hasFunction(value, property) {
    return typeof value?.[property] === "function";
}

/**
 * Retrieve the iterator method from a candidate iterable. Attempts to resolve
 * `Symbol.iterator` first, then falls back to explicit `entries` or `values`
 * methods to support collection-like objects that expose iteration without
 * implementing the standard protocol.
 *
 * @param {unknown} iterable Candidate collection to inspect.
 * @returns {Function | null} Iterator method when present and callable, otherwise `null`.
 */
function getIteratorMethod(iterable) {
    const method =
        iterable?.[Symbol.iterator] ??
        iterable?.entries ??
        iterable?.values ??
        null;

    return typeof method === "function" ? method : null;
}

/**
 * Obtain an actual iterator instance from a candidate iterable by calling the
 * resolved iterator method. Validates that the result is itself iterable to
 * ensure consumers can safely delegate to `for...of` loops without risking
 * runtime errors from malformed iterables.
 *
 * @param {unknown} iterable Candidate collection to materialize an iterator from.
 * @returns {Iterable<unknown> | null} Iterator instance when valid, otherwise `null`.
 */
function getIterator(iterable) {
    const iterator = getIteratorMethod(iterable)?.call(iterable) ?? null;
    return iterator && typeof iterator[Symbol.iterator] === "function"
        ? iterator
        : null;
}

/**
 * Quick check for whether a value supports iteration. Relies on the iterator
 * method presence rather than materializing an actual iterator to keep the
 * probe lightweight when callers only need to guard entry points.
 *
 * @param {unknown} iterable Candidate value to evaluate.
 * @returns {boolean} `true` when an iterator method is present, otherwise `false`.
 */
function hasIterator(iterable) {
    return Boolean(getIteratorMethod(iterable));
}

/**
 * Normalize a size-like value to a finite number or `null`. Guards against
 * `NaN`, `Infinity`, and non-numeric inputs so callers can safely trust the
 * returned value in arithmetic without repeating the same validation.
 *
 * @param {unknown} candidate Size hint to validate.
 * @returns {number | null} Finite number when valid, otherwise `null`.
 */
function getFiniteSize(candidate) {
    return typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : null;
}

/**
 * Extract a numeric size hint from a collection-like object. Checks both `size`
 * and `length` properties in that order to support Map, Set, Array, and
 * array-like structures uniformly without branching on type checks.
 *
 * @param {unknown} iterable Candidate collection to inspect.
 * @returns {number | null} Finite numeric hint when present, otherwise `null`.
 */
function getLengthHint(iterable) {
    return (
        getFiniteSize(iterable?.size) ?? getFiniteSize(iterable?.length) ?? null
    );
}

/**
 * Determine whether a value resembles an `Error` object by checking for the
 * standard `message` property and optional `name` field. Accepts error-like
 * objects from any realm or custom Error subclasses so consumers can handle
 * cross-boundary error reporting without relying on `instanceof`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Error} `true` when the value matches the Error shape.
 */
export function isErrorLike(value) {
    if (!isObjectLike(value)) {
        return false;
    }

    if (typeof value.message !== "string") {
        return false;
    }

    const { name } = value;
    if (name !== undefined && name !== null && typeof name !== "string") {
        return false;
    }

    return true;
}

/**
 * Determine whether a value resembles an `AggregateError` object by confirming
 * both the standard Error shape and an `errors` array property. Supports
 * cross-realm error handling so CLI modules can safely report batched failures
 * without depending on `instanceof AggregateError`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is AggregateError} `true` when the value matches the AggregateError shape.
 */
export function isAggregateErrorLike(value) {
    return isErrorLike(value) && Array.isArray(value.errors);
}

/**
 * Determine whether a value behaves like a `RegExp` by checking for the
 * presence of `test` and `exec` methods. Accepts cross-realm RegExp instances
 * and polyfills so the formatter can uniformly validate pattern-like objects
 * without relying on `instanceof RegExp`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is RegExp} `true` when the value exposes RegExp methods.
 */
export function isRegExpLike(value) {
    return (
        isObjectLike(value) &&
        hasFunction(value, "test") &&
        hasFunction(value, "exec")
    );
}

/**
 * Determine whether a value implements the `Map` interface by confirming it
 * exposes `get`, `set`, `has`, and an iterator method. Accepts cross-realm Map
 * instances and Map-like polyfills so the formatter can treat collection-like
 * structures uniformly regardless of their prototype chain.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Map<unknown, unknown>} `true` when the value behaves like a Map.
 */
export function isMapLike(value) {
    return (
        isObjectLike(value) &&
        hasFunction(value, "get") &&
        hasFunction(value, "set") &&
        hasFunction(value, "has") &&
        hasIterator(value)
    );
}

/**
 * Determine whether a value implements the `Set` interface by confirming it
 * exposes `has`, `add`, and an iterator method. Accepts cross-realm Set
 * instances and Set-like polyfills so callers can normalize collection-like
 * structures without depending on `instanceof Set`.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is Set<unknown>} `true` when the value behaves like a Set.
 */
export function isSetLike(value) {
    return (
        isObjectLike(value) &&
        hasFunction(value, "has") &&
        hasFunction(value, "add") &&
        hasIterator(value)
    );
}

/**
 * Lightweight truthiness probe for collection-like objects. Prefers numeric
 * `length`/`size` hints before walking an iterator so that expensive or
 * side-effectful iterables (generators) are only consumed when strictly
 * necessary. Non-iterable values immediately return `false` so callers can pass
 * optional inputs without pre-validating them.
 *
 * @param {Iterable<unknown> | { length?: number, size?: number } | null | undefined} iterable
 *        Candidate collection to inspect.
 * @returns {boolean} `true` when at least one item is detected, otherwise
 *                    `false`.
 */
export function hasIterableItems(iterable) {
    if (!iterable) {
        return false;
    }

    const lengthHint = getLengthHint(iterable);
    if (lengthHint !== null) {
        return lengthHint > 0;
    }

    const iterator = getIterator(iterable);
    if (!iterator) {
        return false;
    }

    for (const item of iterator) {
        // Mark the first yielded value as intentionally unused so linting rules
        // recognize that the loop only probes for existence.
        void item;
        return true;
    }

    return false;
}

/**
 * Determine how many items an iterable-like object exposes. Numeric hints are
 * trusted when finite, mirroring the fast-path in {@link hasIterableItems};
 * otherwise the iterator is consumed eagerly to obtain an exact count.
 * Non-iterable values fall back to `0` so callers can safely chain arithmetic.
 *
 * @param {Iterable<unknown> | { length?: number, size?: number } | null | undefined} iterable
 *        Candidate collection to size.
 * @returns {number} Number of elements yielded by the iterable.
 */
export function getIterableSize(iterable) {
    const lengthHint = getLengthHint(iterable);
    if (lengthHint !== null) {
        return lengthHint;
    }

    const iterator = getIterator(iterable);
    if (!iterator) {
        return 0;
    }

    let count = 0;
    for (const item of iterator) {
        // The iterator may yield expensive objects, so explicitly ignore the
        // value after confirming iteration succeeded.
        void item;
        count += 1;
    }

    return count;
}

/**
 * Consume an iterable and extract key-value tuples in the form `[key, value]`.
 * Validates that each yielded item is an array with at least two elements,
 * bailing out by returning an empty array when malformed entries are
 * encountered. This ensures downstream `Map` constructors receive clean input.
 *
 * @param {unknown} iterable Candidate iterable to drain.
 * @returns {Array<[unknown, unknown]>} Array of key-value pairs, or an empty
 *          array when the iterable is invalid or yields malformed tuples.
 */
function getIteratorEntries(iterable) {
    const iterator = getIterator(iterable);
    if (!iterator) {
        return [];
    }

    const entries = [];
    for (const entry of iterator) {
        if (!Array.isArray(entry) || entry.length < 2) {
            return [];
        }

        entries.push([entry[0], entry[1]]);
    }

    return entries;
}

/**
 * Normalize an arbitrary value into an array of key-value pairs suitable for
 * constructing a `Map`. Arrays are returned as-is (assuming they contain
 * tuples), iterables are drained into tuple arrays, and plain objects are
 * converted using `Object.entries`. Any other input yields an empty array so
 * callers can predictably construct Maps without additional guards.
 *
 * @param {unknown} candidate Value to resolve into entries.
 * @returns {Array<[unknown, unknown]>} Array of key-value tuples.
 */
function resolveMapEntries(candidate) {
    if (Array.isArray(candidate)) {
        return candidate;
    }

    if (candidate && typeof candidate !== "string" && hasIterator(candidate)) {
        return getIteratorEntries(candidate);
    }

    return isObjectLike(candidate) ? Object.entries(candidate) : [];
}

/**
 * Coerce a value into a `Set`-like instance. Returns the input unmodified when
 * it already implements the Set interface; otherwise constructs a new `Set`
 * from arrays, iterables, or falls back to an empty Set for non-iterable
 * inputs. This helper avoids repeatedly checking type unions when normalizing
 * user options or collection literals.
 *
 * @param {unknown} candidate Value to normalize into a Set.
 * @returns {Set<unknown>} Set-like instance or newly constructed Set.
 */
export function ensureSet(candidate) {
    if (isSetLike(candidate)) {
        return candidate;
    }

    if (Array.isArray(candidate)) {
        return new Set(candidate);
    }

    if (candidate && typeof candidate !== "string" && hasIterator(candidate)) {
        return new Set(candidate);
    }

    return new Set();
}

/**
 * Coerce a value into a `Map`-like instance. Returns the input unmodified when
 * it already implements the Map interface; constructs a new `Map` from entry
 * arrays, iterables, or plain objects via {@link resolveMapEntries}. Set-like
 * inputs yield an empty Map to avoid misinterpreting single values as entries.
 * This helper avoids branching on type unions when normalizing user options.
 *
 * @param {unknown} candidate Value to normalize into a Map.
 * @returns {Map<unknown, unknown>} Map-like instance or newly constructed Map.
 */
export function ensureMap(candidate) {
    if (isMapLike(candidate)) {
        return candidate;
    }

    if (isSetLike(candidate)) {
        return new Map();
    }

    return new Map(resolveMapEntries(candidate));
}
