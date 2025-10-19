import { isObjectLike } from "./object.js";

function hasFunction(value, property) {
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

    if (value.name != undefined && typeof value.name !== "string") {
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

    for (const _ of iterator) {
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
    for (const _ of iterator) {
        count += 1;
    }

    return count;
}
