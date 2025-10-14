const hasOwnProperty = Object.prototype.hasOwnProperty;

export function isObjectLike(value) {
    return typeof value === "object" && value !== null;
}

export function hasOwn(object, key) {
    return hasOwnProperty.call(object, key);
}
