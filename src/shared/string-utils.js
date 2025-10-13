function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function capitalize(value) {
    if (!isNonEmptyString(value)) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

export { capitalize, isNonEmptyString, isNonEmptyTrimmedString };
