function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = Math.floor(value);

        if (normalized > 0) {
            return normalized;
        }

        if (zeroReplacement !== undefined && normalized <= 0) {
            return zeroReplacement;
        }
    }

    return defaultValue;
}

const DEFAULT_SPLIT_PATTERN = /[\n,]/;

function normalizeStringList(
    value,
    {
        splitPattern = DEFAULT_SPLIT_PATTERN,
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
        const pattern = splitPattern ?? DEFAULT_SPLIT_PATTERN;
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

export { coercePositiveIntegerOption, normalizeStringList };
