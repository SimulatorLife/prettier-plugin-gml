import { toArrayFromIterable } from "./array.js";
import { escapeRegExp } from "./regexp.js";

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
 * @param {object} [options]
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

// Use explicit character code boundaries so the hot `isWordChar` guard can run
// without invoking a regular expression on every call.
const CHAR_CODE_DIGIT_START = 48; // 0
const CHAR_CODE_DIGIT_END = 57; // 9
const CHAR_CODE_UPPER_START = 65; // A
const CHAR_CODE_UPPER_END = 90; // Z
const CHAR_CODE_LOWER_START = 97; // a
const CHAR_CODE_LOWER_END = 122; // z
const CHAR_CODE_UNDERSCORE = 95; // _

export function isWordChar(character) {
    if (!isNonEmptyString(character)) {
        return false;
    }

    const code = character.charCodeAt(0);

    if (code === CHAR_CODE_UNDERSCORE) {
        return true;
    }

    if (code < CHAR_CODE_DIGIT_START) {
        return false;
    }

    if (code <= CHAR_CODE_DIGIT_END) {
        return true;
    }

    if (code < CHAR_CODE_UPPER_START) {
        return false;
    }

    if (code <= CHAR_CODE_UPPER_END) {
        return true;
    }

    if (code < CHAR_CODE_LOWER_START) {
        return false;
    }

    return code <= CHAR_CODE_LOWER_END;
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
 * Create a regular expression that splits string lists on the provided
 * separators. Filters out non-string and empty separator values while
 * preserving declaration order so callers can describe platform-specific
 * delimiters without re-implementing deduplication at each site. Optionally
 * includes `\s` in the character class to trim incidental whitespace when
 * splitting human-authored option strings.
 *
 * @param {Iterable<unknown> | string | null | undefined} separators Raw
 *        separator candidates. Strings are treated as a single separator rather
 *        than an iterable of characters.
 * @param {{ includeWhitespace?: boolean }} [options]
 * @param {boolean} [options.includeWhitespace=false] When `true`, whitespace
 *        characters are also treated as delimiters.
 * @returns {RegExp} A character-class-based regular expression suitable for
 *          use with `String#split`.
 */
export function createListSplitPattern(
    separators,
    { includeWhitespace = false } = {}
) {
    const candidates =
        typeof separators === "string"
            ? [separators]
            : separators == null
              ? []
              : toArrayFromIterable(separators);

    const uniqueSeparators = [];
    const seen = new Set();

    for (const candidate of candidates) {
        if (typeof candidate !== "string") {
            continue;
        }

        if (candidate.length === 0) {
            continue;
        }

        if (seen.has(candidate)) {
            continue;
        }

        seen.add(candidate);
        uniqueSeparators.push(candidate);
    }

    const characterClassParts = uniqueSeparators.map((separator) =>
        escapeRegExp(separator)
    );

    if (includeWhitespace) {
        characterClassParts.push(String.raw`\s`);
    }

    if (characterClassParts.length === 0) {
        throw new TypeError(
            "createListSplitPattern requires at least one separator or includeWhitespace=true."
        );
    }

    return new RegExp(`[${characterClassParts.join("")}]+`);
}

const DEFAULT_STRING_LIST_SPLIT_PATTERN = createListSplitPattern(["\n", ","]);

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
    if (typeof value !== "string") {
        return null;
    }

    const length = value.length;
    if (length < 2) {
        return null;
    }

    const firstChar = value[0];
    if (
        firstChar !== DOUBLE_QUOTE_CHARACTER &&
        firstChar !== SINGLE_QUOTE_CHARACTER
    ) {
        return null;
    }

    if (value[length - 1] !== firstChar) {
        return null;
    }

    // Use explicit end index instead of a negative offset so V8 can avoid the
    // additional bounds normalization performed by `String#slice` when a
    // negative argument is supplied.
    return value.slice(1, length - 1);
}

/**
 * Literal double-quote character shared by quote normalization helpers.
 * @type {string}
 */
const DOUBLE_QUOTE_CHARACTER = `"`;
/**
 * Literal single-quote character shared by quote normalization helpers.
 * @type {string}
 */
const SINGLE_QUOTE_CHARACTER = "'";

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
 * @param {object} [options]
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
        const pattern =
            splitPattern === undefined
                ? DEFAULT_STRING_LIST_SPLIT_PATTERN
                : splitPattern;
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
 * @param {object} [options]
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
