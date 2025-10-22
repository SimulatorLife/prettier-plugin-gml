export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

/**
 * Determine whether {@link value} is a string containing at least one
 * non-whitespace character. Mirrors the defensive guards used when parsing
 * identifiers and option values so callers can accept padded input without
 * introducing bespoke trimming logic.
 *
 * @param {unknown} value Candidate value to evaluate.
 * @returns {value is string} `true` when {@link value} is a non-empty string
 *                             after trimming.
 */
export function isNonEmptyTrimmedString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Normalize {@link value} into a trimmed string or `null` when it does not
 * contain visible characters. Keeps option normalization helpers consistent by
 * collapsing blank or non-string inputs to a single sentinel value instead of
 * leaking empty strings through call sites.
 *
 * @param {unknown} value Candidate value to normalize.
 * @returns {string | null} Trimmed string when populated, otherwise `null`.
 */
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

/**
 * Trim each string entry in {@link values}, preserving array order. Throws when
 * encountering a non-string entry so call sites relying on `String#split`
 * semantics continue to surface early when provided unexpected input.
 *
 * @param {Array<string>} values List of string entries to trim.
 * @returns {Array<string>} New array containing the trimmed entries.
 */
export function trimStringEntries(values) {
    const errorMessage = "values must be provided as an array of strings.";

    if (!Array.isArray(values)) {
        throw new TypeError(errorMessage);
    }

    return values.map((value) => {
        if (typeof value !== "string") {
            throw new TypeError(errorMessage);
        }

        return value.trim();
    });
}

/**
 * Remove matching string quotes from {@link value}, returning `null` when the
 * input is not a quoted string. Supports both single- and double-quoted
 * literals so call sites can focus on their specific validation logic without
 * repeating defensive slicing guards.
 *
 * @param {unknown} value Candidate string literal.
 * @returns {string | null} Inner string content when wrapped in matching quotes.
 */
export function stripStringQuotes(value) {
    if (typeof value !== "string" || value.length < 2) {
        return null;
    }

    const firstChar = value[0];
    const lastChar = value.at(-1);

    if (isQuoteCharacter(firstChar) && firstChar === lastChar) {
        return value.slice(1, -1);
    }

    return null;
}

/**
 * Literal double-quote character shared by quote normalization helpers.
 * @type {string}
 */
const DOUBLE_QUOTE_CHARACTER = '"';
/**
 * Literal single-quote character shared by quote normalization helpers.
 * @type {string}
 */
const SINGLE_QUOTE_CHARACTER = "'";

function isQuoteCharacter(character) {
    return (
        character === DOUBLE_QUOTE_CHARACTER ||
        character === SINGLE_QUOTE_CHARACTER
    );
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
 *        consumer. Arrays are flattened as-is; strings are split using
 *        `splitPattern`.
 * @param {Object} [options]
 * @param {RegExp | null | false} [options.splitPattern=/[\n,]/] Pattern used to split
 *        string input. Provide a falsy value (for example `false`) to keep the entire
 *        string as a single entry.
 * @param {boolean} [options.allowInvalidType=false] If `true`, invalid types
 *        are treated as "no value" instead of throwing.
 * @param {string} [options.errorMessage] Message used when raising a
 *        `TypeError` for invalid types. Defaults to a generic string when omitted.
 * @returns {string[]} A list of unique, trimmed entries in input order.
 * @throws {TypeError} When `value` is not a string or array and
 *        `allowInvalidType` is `false`.
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

function collectUniqueTrimmedStrings(entries) {
    const normalized = [];
    const seen = new Set();

    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) {
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
 * @param {string | string[] | null | undefined} value Raw option value.
 * @param {Object} [options]
 * @param {RegExp | null | false} [options.splitPattern=null] Pattern passed through
 *        to `normalizeStringList` for string input. Provide a falsy value to keep
 *        entire strings intact.
 * @param {boolean} [options.allowInvalidType=true] Whether to treat invalid
 *        types as empty input.
 * @param {string} [options.errorMessage] Message forwarded to
 *        `normalizeStringList` when raising a `TypeError`.
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
