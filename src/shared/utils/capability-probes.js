import { isObjectLike } from "./object.js";

function hasFunction(value, property) {
    return typeof value?.[property] === "function";
}

function getIteratorFactory(value) {
    if (typeof value?.[Symbol.iterator] === "function") {
        return () => value[Symbol.iterator]();
    }

    if (hasFunction(value, "entries")) {
        return () => value.entries();
    }

    if (hasFunction(value, "values")) {
        return () => value.values();
    }

    return null;
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

    return Boolean(getIteratorFactory(value));
}

export function isSetLike(value) {
    if (!isObjectLike(value)) {
        return false;
    }

    if (!hasFunction(value, "has") || !hasFunction(value, "add")) {
        return false;
    }

    return Boolean(getIteratorFactory(value));
}

export function hasIterableItems(iterable) {
    if (!iterable) {
        return false;
    }

    if (typeof iterable.size === "number" && Number.isFinite(iterable.size)) {
        return iterable.size > 0;
    }

    if (
        typeof iterable.length === "number" &&
        Number.isFinite(iterable.length)
    ) {
        return iterable.length > 0;
    }

    const iteratorFactory = getIteratorFactory(iterable);
    if (!iteratorFactory) {
        return false;
    }

    const iterator = iteratorFactory();
    if (!iterator || typeof iterator.next !== "function") {
        return false;
    }

    const { done } = iterator.next();

    if (typeof iterator.return === "function") {
        try {
            iterator.return();
        } catch {
            // Ignore iterator close errors.
        }
    }

    return done === false;
}

export function getIterableSize(iterable) {
    if (typeof iterable.size === "number" && Number.isFinite(iterable.size)) {
        return iterable.size;
    }

    if (
        typeof iterable.length === "number" &&
        Number.isFinite(iterable.length)
    ) {
        return iterable.length;
    }

    const iteratorFactory = getIteratorFactory(iterable);
    if (!iteratorFactory) {
        return 0;
    }

    const iterator = iteratorFactory();
    if (!iterator || typeof iterator.next !== "function") {
        return 0;
    }

    let count = 0;
    while (true) {
        const { done } = iterator.next();
        if (done) {
            break;
        }
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
