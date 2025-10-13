export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

export function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

export function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function capitalize(value) {
    if (!isNonEmptyString(value)) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}
