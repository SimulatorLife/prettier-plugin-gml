/**
 * Determine whether {@link value} is a string containing at least one
 * character.
 *
 * Most helpers in this module normalize string inputs before performing their
 * primary work. Documenting the base predicate keeps its contract aligned with
 * the richer trimming variants below and clarifies that blank strings are
 * intentionally rejected.
 *
 * @param {unknown} value Candidate value to evaluate.
 * @returns {value is string} `true` when {@link value} is a non-empty string.
 */
export declare function isNonEmptyString(value: any): boolean;
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
export declare function isNonEmptyTrimmedString(value: any): boolean;
/**
 * Normalize {@link value} into a trimmed string or `null` when it does not
 * contain visible characters. Keeps option normalization helpers consistent by
 * collapsing blank or non-string inputs to a single sentinel value instead of
 * leaking empty strings through call sites.
 *
 * @param {unknown} value Candidate value to normalize.
 * @returns {string | null} Trimmed string when populated, otherwise `null`.
 */
export declare function getNonEmptyTrimmedString(value: any): string;
/**
 * Normalize a file extension by trimming whitespace, ensuring a leading dot,
 * and lowercasing the result. Invalid inputs (including bare dots or
 * non-string values) are collapsed to `null` so callers can surface consistent
 * error messages without repeating guard logic.
 *
 * @param {unknown} value Candidate extension string.
 * @returns {string | null} Lower-cased extension beginning with a dot when
 *          valid; otherwise `null`.
 */
export declare function normalizeExtensionSuffix(value: any): string;
/**
 * Normalize escape sequences in a string to a consistent format.
 *
 * @param {string} text The input string to normalize.
 * @returns {string} The normalized string with consistent escape sequences.
 */
export declare function normalizeSimpleEscapeCase(text: any): any;
/**
 * Check whether {@link value} is a quoted string (using single or double quotes).
 * @param {*} value
 * @returns {boolean} `true` when {@link value} is a quoted string.
 */
export declare function isQuotedString(value: any): boolean;
/**
 * Return {@link value} when it is a populated string, otherwise yield `null`.
 *
 * This mirrors the trimmed variant above without altering surrounding
 * whitespace, making the distinction between trimmed and raw string checks
 * explicit for future readers.
 *
 * @param {unknown} value Candidate value to normalize.
 * @returns {string | null} Original string when populated; otherwise `null`.
 */
export declare function getNonEmptyString(value: any): any;
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
export declare function assertNonEmptyString(
    value: any,
    {
        name,
        trim,
        errorMessage
    }?: {
        name?: string;
        trim?: boolean;
    }
): string;
/**
 * Describe an arbitrary {@link value} for use in error messages.
 *
 * Centralizes the defensive guards sprinkled across option validators and
 * error helpers so callers can surface readable diagnostics without repeating
 * null/undefined checks or worrying about serialization failures. Strings are
 * quoted for clarity, numeric primitives preserve their native formatting, and
 * complex structures fall back to JSON serialization when permitted.
 *
 * @param {unknown} value Candidate value to format for display.
 * @param {{ stringifyUnknown?: boolean }} [options]
 * @param {boolean} [options.stringifyUnknown=true] When `false`, skip JSON
 *        serialization for non-primitive values and defer directly to
 *        `String(value)`.
 * @returns {string} Human-readable description of {@link value}.
 */
export declare function describeValueForError(
    value: any,
    {
        stringifyUnknown
    }?: {
        stringifyUnknown?: boolean;
    }
): any;
/**
 * Prefix {@link label} with an appropriate indefinite article ("a" or "an").
 *
 * Keeps the grammar used by human-readable error messages consistent across the
 * CLI by centralizing the vowel detection heuristics. Callers receive the
 * normalized label even when it includes surrounding whitespace so existing
 * messages remain unchanged.
 *
 * @param {string} label Descriptive label to format.
 * @returns {string} {@link label} prefixed with "a" or "an" as appropriate.
 */
export declare function formatWithIndefiniteArticle(label: any): string;
export declare function isWordChar(character: any): boolean;
/**
 * Convert {@link value} into a trimmed string, returning an empty string when
 * a non-string input is supplied. Callers often forward raw option values or
 * AST fragments whose types are not guaranteed, so normalizing here keeps the
 * guard centralized and allocation-free when the value is already a string.
 *
 * @param {unknown} value Value to normalize.
 * @returns {string} Trimmed string when {@link value} is a string; otherwise
 *                   the empty string.
 */
export declare function toTrimmedString(value: any): string;
/**
 * Return the first argument that yields a non-empty trimmed string. Mirrors
 * the fallback semantics used throughout the plugin when resolving optional
 * identifiers, documentation strings, or override lists where multiple
 * potential sources may be provided.
 *
 * @param {...unknown} values Candidate values to evaluate in order.
 * @returns {string} The first populated trimmed string; otherwise the empty
 *                   string when all inputs are blank or missing.
 */
export declare function coalesceTrimmedString(...values: any[]): string;
/**
 * Normalize {@link value} into a lower-cased, trimmed string so lookups can be
 * performed without repeatedly guarding against `null`, numbers, or padded
 * input.
 *
 * @param {unknown} value Value to normalize.
 * @returns {string} Lower-cased string representation with surrounding
 *                   whitespace removed. Returns `""` when {@link value} is
 *                   `null` or `undefined`.
 */
export declare function toNormalizedLowerCaseString(value: any): string;
export declare function capitalize(value: any): any;
/**
 * Create a regular expression that splits string lists on the provided
 * separators. Filters out non-string and empty separator values while
 * preserving declaration order among equally sized entries so callers can
 * describe platform-specific delimiters without re-implementing deduplication
 * at each site. Longer separators are matched before shorter ones to avoid
 * partial matches splitting multi-character tokens. Optionally includes `\s`
 * to trim incidental whitespace when splitting human-authored option strings.
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
export declare function createListSplitPattern(
    separators: any,
    {
        includeWhitespace
    }?: {
        includeWhitespace?: boolean;
    }
): RegExp;
/**
 * Trim each string entry in {@link values}, preserving array order. Throws when
 * encountering a non-string entry so call sites relying on `String#split`
 * semantics continue to surface early when provided unexpected input.
 *
 * @param {Array<string>} values List of string entries to trim.
 * @returns {Array<string>} New array containing the trimmed entries.
 */
export declare function trimStringEntries(values: any): string[];
/**
 * Remove matching string quotes from {@link value}, returning `null` when the
 * input is not a quoted string. Supports both single- and double-quoted
 * literals so call sites can focus on their specific validation logic without
 * repeating defensive slicing guards.
 *
 * @param {unknown} value Candidate string literal.
 * @returns {string | null} Inner string content when wrapped in matching quotes.
 */
export declare function stripStringQuotes(value: any): string;
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
export declare function normalizeStringList(
    value: any,
    {
        splitPattern,
        allowInvalidType,
        errorMessage
    }?: {
        splitPattern?: RegExp;
        allowInvalidType?: boolean;
        errorMessage?: string;
    }
): any;
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
export declare function toNormalizedLowerCaseSet(
    value: any,
    {
        splitPattern,
        allowInvalidType,
        errorMessage
    }?: {
        splitPattern?: any;
        allowInvalidType?: boolean;
    }
): Set<unknown>;
