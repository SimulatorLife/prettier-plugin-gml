const hasOwnProperty = Object.prototype.hasOwnProperty;

export function isObjectLike(value) {
    return typeof value === "object" && value !== null;
}

export function withObjectLike(value, onObjectLike, onNotObjectLike) {
    if (typeof onObjectLike !== "function") {
        throw new TypeError("onObjectLike must be a function");
    }

    if (isObjectLike(value)) {
        return onObjectLike(value);
    }

    if (typeof onNotObjectLike === "function") {
        return onNotObjectLike();
    }

    return onNotObjectLike;
}

export function hasOwn(object, key) {
    return hasOwnProperty.call(object, key);
}
