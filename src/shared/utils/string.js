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

/**
 * Assert that the provided value is a non-empty string. Optionally trims the
 * value before evaluating emptiness so call sites can accept padded input
 * without repeating `String#trim` checks.
 *
 * @param {unknown} value Candidate value to validate.
 * @param {Object} [options]
 * @param {string} [options.name="value"] Descriptive name used when
 *        constructing the default error message.
 * @param {boolean} [options.trim=false] When `true`, trim the value before
 *        verifying it is non-empty.
 * @param {string} [options.errorMessage] Optional error message that overrides
 *        the default string when validation fails.
 * @returns {string} The validated string value (trimmed when requested).
 * @throws {TypeError} When `value` is not a string or is empty after trimming.
 */
export function assertNonEmptyString(
    value,
    { name = "value", trim = false, errorMessage } = {}
) {
    const message =
        errorMessage ?? `${name} must be provided as a non-empty string.`;

    if (typeof value !== "string") {
        throw new TypeError(message);
    }

    const normalized = trim ? value.trim() : value;
    if (normalized.length === 0) {
        throw new TypeError(message);
    }

    return normalized;
}

export function isWordChar(character) {
    return typeof character === "string" && /[\w]/.test(character);
}

export function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function coalesceTrimmedString(...values) {
    for (const value of values) {
        if (value == null) {
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
    if (value == null) {
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
 * @param {string | string[] | null | undefined} value Raw option value provided by a
 *   consumer. Arrays are flattened as-is; strings are split using
 *   `splitPattern`.
 * @param {Object} [options]
 * @param {RegExp | null | false} [options.splitPattern=/[\n,]/] Pattern used to split
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
    if (value == null) {
        return [];
    }

    if (Array.isArray(value)) {
        return collectUniqueTrimmedStrings(value);
    }

    if (typeof value === "string") {
        const pattern = splitPattern ?? DEFAULT_STRING_LIST_SPLIT_PATTERN;
        const entries = pattern ? value.split(pattern) : [value];
        return collectUniqueTrimmedStrings(entries);
    }

    if (allowInvalidType) {
        return [];
    }

    throw new TypeError(errorMessage);
}

const UNIQUE_SET_THRESHOLD = 8;

function collectUniqueTrimmedStrings(entries) {
    const normalized = [];
    let seen = null;

    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (!trimmed) {
            continue;
        }

        if (seen) {
            if (seen.has(trimmed)) {
                continue;
            }
        } else if (normalized.length >= UNIQUE_SET_THRESHOLD) {
            // Lazily create the tracking set once inputs grow beyond a small
            // handful of unique entries so short options avoid Set allocations
            // entirely. This mirrors the previous O(1) duplicate detection for
            // larger lists without penalizing the common "one or two values"
            // call sites.
            seen = new Set(normalized);

            if (seen.has(trimmed)) {
                continue;
            }
        } else if (normalized.includes(trimmed)) {
            // A duplicate showed up before we crossed the threshold, so start
            // tracking membership with a Set for subsequent iterations. The
            // duplicate itself is skipped to preserve the original behavior.
            seen = new Set(normalized);
            continue;
        }

        normalized.push(trimmed);

        if (seen) {
            seen.add(trimmed);
        }
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
 * @param {string | string[] | null | undefined} value Raw option value.
 * @param {Object} [options]
 * @param {RegExp | null | false} [options.splitPattern=null] Pattern passed through
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

    // Avoid allocating an intermediate array via `Array#map` when converting the
    // normalized values to lower case. This helper sits on the option parsing
    // hot path, so trimming even a single allocation helps keep repeated calls
    // inexpensive.
    const normalizedSet = new Set();
    for (const entry of normalizedValues) {
        normalizedSet.add(entry.toLowerCase());
    }

    return normalizedSet;
}
