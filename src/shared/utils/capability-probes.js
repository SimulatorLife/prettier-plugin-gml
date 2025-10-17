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
    return length !== null ? length : null;
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

export function isSyntaxErrorWithLocation(value) {
    if (!isErrorLike(value)) {
        return false;
    }

    const hasFiniteLine = Number.isFinite(Number(value.line));
    const hasFiniteColumn = Number.isFinite(Number(value.column));

    if (!hasFiniteLine && !hasFiniteColumn) {
        return false;
    }

    if (value.rule != undefined && typeof value.rule !== "string") {
        return false;
    }

    if (
        value.wrongSymbol != undefined &&
        typeof value.wrongSymbol !== "string"
    ) {
        return false;
    }

    if (
        value.offendingText != undefined &&
        typeof value.offendingText !== "string"
    ) {
        return false;
    }

    return true;
}
