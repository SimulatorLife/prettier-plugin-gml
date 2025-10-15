export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

export function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

export function getNonEmptyString(value) {
    return isNonEmptyString(value) ? value : null;
}

const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;

export function isWordChar(character) {
    if (typeof character !== "string" || character.length === 0) {
        return false;
    }

    return WORD_CHAR_PATTERN.test(character);
}

export function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function toNormalizedLowerCaseString(value) {
    if (value == null) {
        return "";
    }

    return String(value).trim().toLowerCase();
}

export function capitalize(value) {
    if (!isNonEmptyString(value)) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

const DEFAULT_STRING_LIST_SPLIT_PATTERN = /[\n,]/;

export function normalizeStringList(
    value,
    {
        splitPattern = DEFAULT_STRING_LIST_SPLIT_PATTERN,
        allowInvalidType = false,
        errorMessage = "Value must be provided as a string or array of strings."
    } = {}
) {
    if (value == null) {
        return [];
    }

    let entries = null;
    if (Array.isArray(value)) {
        entries = value;
    } else if (typeof value === "string") {
        const pattern = splitPattern ?? DEFAULT_STRING_LIST_SPLIT_PATTERN;
        entries = pattern ? value.split(pattern) : [value];
    } else if (allowInvalidType) {
        return [];
    }

    if (!entries) {
        throw new TypeError(errorMessage);
    }

    const seen = new Set();

    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (trimmed.length === 0) {
            continue;
        }

        seen.add(trimmed);
    }

    return [...seen];
}
