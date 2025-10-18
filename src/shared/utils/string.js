export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

export function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

export function getNonEmptyTrimmedString(value) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }

    return trimmed;
}

export function getNonEmptyString(value) {
    return isNonEmptyString(value) ? value : null;
}

export function isWordChar(character) {
    return typeof character === "string" && /[\w]/.test(character);
}

export function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function coalesceTrimmedString(...values) {
    for (const value of values) {
        if (value == undefined) {
            continue;
        }

        const trimmed = toTrimmedString(value);
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return "";
}

export function toNormalizedLowerCaseString(value) {
    if (value == undefined) {
        return "";
    }

    return String(value).trim().toLowerCase();
}

export function capitalize(value) {
    if (!isNonEmptyString(value)) {
        return value;
    }

    return value.at(0).toUpperCase() + value.slice(1);
}

const DEFAULT_STRING_LIST_SPLIT_PATTERN = /[\n,]/;

/**
 * Normalize a string-or-string-array option into a deduplicated list of
 * trimmed strings.
 *
 * Non-string entries are discarded and duplicate values (after trimming) are
 * collapsed. When `allowInvalidType` is `false` the helper mirrors native
 * `TypeError` semantics for invalid types so option parsing can surface clear
 * feedback to callers.
 *
 * @param {string|string[]|null|undefined} value Raw option value provided by a
 *   consumer. Arrays are flattened as-is; strings are split using
 *   `splitPattern`.
 * @param {Object} [options]
 * @param {RegExp|null|false} [options.splitPattern=/[\n,]/] Pattern used to split
 *   string input. Provide a falsy value (for example `false`) to keep the entire
 *   string as a single entry.
 * @param {boolean} [options.allowInvalidType=false] If `true`, invalid types
 *   are treated as "no value" instead of throwing.
 * @param {string} [options.errorMessage] Message used when raising a
 *   `TypeError` for invalid types. Defaults to a generic string when omitted.
 * @returns {string[]} A list of unique, trimmed entries in input order.
 * @throws {TypeError} When `value` is not a string or array and
 *   `allowInvalidType` is `false`.
 */
export function normalizeStringList(
    value,
    {
        splitPattern = DEFAULT_STRING_LIST_SPLIT_PATTERN,
        allowInvalidType = false,
        errorMessage = "Value must be provided as a string or array of strings."
    } = {}
) {
    if (value == undefined) {
        return [];
    }

    let entries;

    if (Array.isArray(value)) {
        entries = value;
    } else if (typeof value === "string") {
        const pattern = splitPattern ?? DEFAULT_STRING_LIST_SPLIT_PATTERN;
        entries = pattern ? value.split(pattern) : [value];
    } else {
        if (allowInvalidType) {
            return [];
        }

        throw new TypeError(errorMessage);
    }

    const normalized = [];
    const seen = new Set();

    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) {
            continue;
        }

        seen.add(trimmed);
        normalized.push(trimmed);
    }

    return normalized;
}

/**
 * Convert user-provided string-ish options into a case-insensitive lookup set.
 *
 * The helper applies `normalizeStringList` semantics before lowercasing each
 * entry so callers can compare configuration values without worrying about
 * minor formatting differences.
 *
 * @param {string|string[]|null|undefined} value Raw option value.
 * @param {Object} [options]
 * @param {RegExp|null|false} [options.splitPattern=null] Pattern passed through
 *   to `normalizeStringList` for string input. Provide a falsy value to keep
 *   entire strings intact.
 * @param {boolean} [options.allowInvalidType=true] Whether to treat invalid
 *   types as empty input.
 * @param {string} [options.errorMessage] Message forwarded to
 *   `normalizeStringList` when raising a `TypeError`.
 * @returns {Set<string>} Lower-cased set of unique entries.
 */
export function toNormalizedLowerCaseSet(
    value,
    { splitPattern = null, allowInvalidType = true, errorMessage } = {}
) {
    const normalizedValues = normalizeStringList(value, {
        splitPattern,
        allowInvalidType,
        errorMessage
    });

    return new Set(normalizedValues.map((entry) => entry.toLowerCase()));
}
