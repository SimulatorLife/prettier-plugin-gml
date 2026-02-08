import { isObjectLike } from "./object.js";

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
 * Extract a numeric size hint from a collection-like object. Checks both `size`
 * and `length` properties in that order to support Map, Set, Array, and
 * array-like structures uniformly without branching on type checks.
 *
 * @param {unknown} iterable Candidate collection to inspect.
 * @returns {number | null} Finite numeric hint when present, otherwise `null`.
 */
function getLengthHint(iterable): number | null {
    const sizeCandidate = iterable?.size ?? iterable?.length;
    return typeof sizeCandidate === "number" && Number.isFinite(sizeCandidate) ? sizeCandidate : null;
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
export function isErrorLike(value: unknown): value is Error {
    if (!isObjectLike(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    if (typeof candidate.message !== "string") {
        return false;
    }

    const { name } = candidate;
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
export function isAggregateErrorLike(value: unknown): value is AggregateError {
    return isErrorLike(value) && Array.isArray((value as unknown as { errors: unknown }).errors);
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
    return isObjectLike(value) && hasFunction(value, "test") && hasFunction(value, "exec");
}

/**
 * Quick check for whether a value supports iteration.
 *
 * @param {unknown} iterable Candidate value to evaluate.
 * @returns {boolean} `true` when an iterator method is present, otherwise `false`.
 */
function hasIterator(iterable): boolean {
    const method = iterable?.[Symbol.iterator] ?? iterable?.entries ?? iterable?.values;
    return typeof method === "function";
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
    return isObjectLike(value) && hasFunction(value, "has") && hasFunction(value, "add") && hasIterator(value);
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

    // Try to get an iterator method and call it
    const method = iterable?.[Symbol.iterator] ?? iterable?.entries ?? iterable?.values;
    if (typeof method !== "function") {
        return false;
    }

    try {
        const iterator = method.call(iterable);
        if (!iterator || typeof iterator[Symbol.iterator] !== "function") {
            return false;
        }

        // Check if iterator yields at least one item
        for (const item of iterator) {
            void item;
            return true;
        }
    } catch {
        return false;
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

    // Try to get an iterator method and call it
    const method = iterable?.[Symbol.iterator] ?? iterable?.entries ?? iterable?.values;
    if (typeof method !== "function") {
        return 0;
    }

    try {
        const iterator = method.call(iterable);
        if (!iterator || typeof iterator[Symbol.iterator] !== "function") {
            return 0;
        }

        let count = 0;
        for (const item of iterator) {
            void item;
            count += 1;
        }
        return count;
    } catch {
        return 0;
    }
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

    // Try to extract entries from iterable
    const method = candidate?.[Symbol.iterator] ?? candidate?.entries ?? candidate?.values;
    if (typeof method === "function") {
        try {
            const iterator = method.call(candidate);
            if (!iterator || typeof iterator[Symbol.iterator] !== "function") {
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
        } catch {
            return [];
        }
    }

    // Fallback to Object.entries for plain objects
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

    if (Array.isArray(candidate) || (candidate && typeof candidate !== "string" && hasIterator(candidate))) {
        try {
            return new Set(candidate);
        } catch {
            return new Set();
        }
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

/**
 * Determine whether a value implements the WorkspaceEdit interface by confirming
 * it exposes an `edits` array property and the required methods. Accepts any
 * object that conforms to the expected contract (duck-typed interface) so
 * refactor operations can work with substitutable implementations without relying
 * on `instanceof` checks that break polymorphism across module boundaries.
 *
 * @param {unknown} [value] Candidate value to inspect.
 * @returns {boolean} `true` when the value behaves like a WorkspaceEdit.
 */
export function isWorkspaceEditLike(value?: unknown): boolean {
    if (!isObjectLike(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;

    return Array.isArray(candidate.edits) && hasFunction(candidate, "addEdit") && hasFunction(candidate, "groupByFile");
}
