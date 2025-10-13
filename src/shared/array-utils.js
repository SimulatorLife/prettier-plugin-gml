export function toArray(value) {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

export function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}
