export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

export function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

export function getNonEmptyString(value) {
    return isNonEmptyString(value) ? value : null;
}

// Hoist frequently accessed character code constants so `isWordChar` can avoid
// constructing a `RegExp` for every call while still remaining easy to read.
const CHAR_CODE_UPPER_A = "A".charCodeAt(0);
const CHAR_CODE_UPPER_Z = "Z".charCodeAt(0);
const CHAR_CODE_LOWER_A = "a".charCodeAt(0);
const CHAR_CODE_LOWER_Z = "z".charCodeAt(0);
const CHAR_CODE_DIGIT_0 = "0".charCodeAt(0);
const CHAR_CODE_DIGIT_9 = "9".charCodeAt(0);
const CHAR_CODE_UNDERSCORE = "_".charCodeAt(0);

export function isWordChar(character) {
    if (typeof character !== "string" || character.length === 0) {
        return false;
    }

    for (let index = 0; index < character.length; index += 1) {
        const charCode = character.charCodeAt(index);

        if (
            (charCode >= CHAR_CODE_UPPER_A && charCode <= CHAR_CODE_UPPER_Z) ||
            (charCode >= CHAR_CODE_LOWER_A && charCode <= CHAR_CODE_LOWER_Z) ||
            (charCode >= CHAR_CODE_DIGIT_0 && charCode <= CHAR_CODE_DIGIT_9) ||
            charCode === CHAR_CODE_UNDERSCORE
        ) {
            return true;
        }
    }

    return false;
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

function getCandidateEntries(value, splitPattern) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const pattern = splitPattern ?? DEFAULT_STRING_LIST_SPLIT_PATTERN;
    return pattern ? value.split(pattern) : [value];
}

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
 * @param {RegExp|null} [options.splitPattern=/[\n,]/] Pattern used to split
 *   string input. A `null` pattern keeps the entire string as a single entry.
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

    const entries = getCandidateEntries(value, splitPattern);

    if (!entries) {
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
 * @param {RegExp|null} [options.splitPattern=null] Pattern passed through to
 *   `normalizeStringList` for string input.
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

    const normalizedSet = new Set();

    // Populate the set via a manual loop to avoid allocating a temporary array
    // for `Array#map` on each invocation. The helper runs in hot formatter and
    // option-parsing paths, so keeping it allocation-free shaves measurable
    // time off tight micro-benchmarks.
    for (let index = 0; index < normalizedValues.length; index += 1) {
        normalizedSet.add(normalizedValues[index].toLowerCase());
    }

    return normalizedSet;
}
