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

function getIteratorMethod(iterable) {
    if (!iterable) {
        return null;
    }

    const method =
        iterable[Symbol.iterator] ??
        iterable.entries ??
        iterable.values ??
        null;

    return typeof method === "function" ? method : null;
}

function getIterator(iterable) {
    const method = getIteratorMethod(iterable);
    if (!method) {
        return null;
    }

    const iterator = method.call(iterable);
    return typeof iterator?.[Symbol.iterator] === "function" ? iterator : null;
}

function hasIterator(iterable) {
    return Boolean(getIteratorMethod(iterable));
}

function getFiniteSize(candidate) {
    return typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : null;
}

function getLengthHint(iterable) {
    const size = getFiniteSize(iterable?.size);
    if (size !== null) {
        return size;
    }

    const length = getFiniteSize(iterable?.length);
    return length === null ? null : length;
}

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

export function isAggregateErrorLike(value) {
    return isErrorLike(value) && Array.isArray(value.errors);
}

export function isRegExpLike(value) {
    if (!isObjectLike(value)) {
        return false;
    }

    return hasFunction(value, "test") && hasFunction(value, "exec");
}

export function isMapLike(value) {
    if (!isObjectLike(value)) {
        return false;
    }

    if (!hasFunction(value, "get") || !hasFunction(value, "set")) {
        return false;
    }

    if (!hasFunction(value, "has")) {
        return false;
    }

    return hasIterator(value);
}

export function isSetLike(value) {
    if (!isObjectLike(value)) {
        return false;
    }

    if (!hasFunction(value, "has") || !hasFunction(value, "add")) {
        return false;
    }

    return hasIterator(value);
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

function resolveMapEntries(candidate) {
    if (Array.isArray(candidate)) {
        return candidate;
    }

    if (candidate && typeof candidate !== "string" && hasIterator(candidate)) {
        return getIteratorEntries(candidate);
    }

    if (isObjectLike(candidate)) {
        return Object.entries(candidate);
    }

    return [];
}

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

export function ensureMap(candidate) {
    if (isMapLike(candidate)) {
        return candidate;
    }

    if (isSetLike(candidate)) {
        return new Map();
    }

    return new Map(resolveMapEntries(candidate));
}
