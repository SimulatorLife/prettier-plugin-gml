import { toNormalizedInteger } from "./number.js";

const DEFAULT_PARSE_STRING = (text) => Number.parseInt(text, 10);

function coerceInteger(value, { min, received, createErrorMessage }) {
    const normalized = toNormalizedInteger(value);
    if (normalized !== null && normalized >= min) {
        return normalized;
    }

    const formattedReceived = received ?? value;
    const fallbackMessage = `Value must be an integer greater than or equal to ${min} (received ${formattedReceived}).`;

    const message =
        typeof createErrorMessage === "function"
            ? createErrorMessage(formattedReceived)
            : (createErrorMessage ?? fallbackMessage);

    throw new TypeError(message);
}

export function coercePositiveInteger(value, options = {}) {
    return coerceInteger(value, {
        min: 1,
        ...options
    });
}

export function coerceNonNegativeInteger(value, options = {}) {
    return coerceInteger(value, {
        min: 0,
        ...options
    });
}

/**
 * Normalize option values that represent positive integers while handling
 * the frequently used "zero disables" idiom. Unlike {@link
 * coercePositiveInteger} this helper keeps `undefined`, `null`, and
 * non-numeric inputs from throwing so option parsing can fall back to the
 * provided default.
 *
 * @param {unknown} value Raw option value to inspect.
 * @param {number} defaultValue Fallback returned when the option is absent or
 *                              resolves to zero without an explicit
 *                              `zeroReplacement`.
 * @param {Object} [options]
 * @param {number} [options.zeroReplacement] Replacement to use when the
 *                                           normalized value is exactly zero.
 * @returns {number} Either the coerced positive integer, the zero
 *                   replacement, or `defaultValue` when the input is blank.
 */
export function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    const normalized = toNormalizedInteger(value);

    if (normalized === null) {
        return defaultValue;
    }

    if (normalized > 0) {
        return normalized;
    }

    if (zeroReplacement !== undefined) {
        return zeroReplacement;
    }

    return defaultValue;
}

/**
 * Coerce configuration values into integers while supporting number and
 * string inputs. This underpins option handling across the formatter where
 * command-line flags, API consumers, or configuration files may all supply
 * the same setting. Callers supply the {@link coerce} callback to define the
 * exact numeric bounds or post-processing.
 *
 * Edge cases to be aware of:
 * - `undefined`, `null`, and (optionally) blank strings resolve to the
 *   `defaultValue` so that omitted CLI flags behave like unset config keys.
 * - String inputs are trimmed before parsing to keep incidental whitespace from
 *   tripping validation.
 * - Non-string/non-number values raise a `TypeError`, with the message either
 *   caller-provided or auto-generated for debugging clarity.
 *
 * @param {unknown} rawValue Incoming option value.
 * @param {Object} [options]
 * @param {number} [options.defaultValue] Fallback when the option is missing.
 * @param {(value: number, options: object) => number} options.coerce Function
 *        invoked with the parsed number and context to validate range or
 *        return alternate values.
 * @param {(text: string) => number} [options.parseString=DEFAULT_PARSE_STRING]
 *        Custom parser for string inputs, e.g. to support hex or binary
 *        notation.
 * @param {string | ((type: string) => string)} [options.typeErrorMessage]
 *        Overrides the error message when a non-number, non-string value is
 *        provided.
 * @param {boolean} [options.blankStringReturnsDefault=true] When `true`, blank
 *        strings short-circuit to the default; otherwise they are parsed.
 * @returns {number | undefined} The coerced numeric option value.
 */
export function resolveIntegerOption(
    rawValue,
    {
        defaultValue,
        coerce,
        parseString = DEFAULT_PARSE_STRING,
        typeErrorMessage,
        blankStringReturnsDefault = true
    } = {}
) {
    if (rawValue === undefined || rawValue === null) {
        return defaultValue;
    }

    if (typeof rawValue === "number") {
        return coerce(rawValue, { received: rawValue });
    }

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (trimmed === "" && blankStringReturnsDefault) {
            return defaultValue;
        }

        const parsed = parseString(trimmed, 10);
        return coerce(parsed, { received: `'${rawValue}'` });
    }

    const type = typeof rawValue;
    const fallbackMessage = `Value must be provided as a number (received type '${type}').`;

    const message =
        typeof typeErrorMessage === "function"
            ? typeErrorMessage(type)
            : (typeErrorMessage ?? fallbackMessage);

    throw new TypeError(message);
}

/**
 * Normalize numeric Prettier options to a sanitized value or `undefined`.
 * This sits closer to the public API surface than {@link resolveIntegerOption}
 * and therefore performs stronger type guarding and richer context reporting
 * for error messages.
 *
 * When consumers provide strings, the value is trimmed before validation so
 * whitespace-only inputs are treated as "unset". Callers receive rich context
 * about the coercion attempt so they can tailor error messages without
 * needing an extra abstraction layer.
 *
 * @param {unknown} rawValue Incoming option value from configuration or CLI.
 * @param {Object} options
 * @param {string} options.optionName Human-readable option name used in error
 *        messages.
 * @param {(value: number, context: Object) => number | undefined} options.coerce
 *        Coercion function that enforces bounds and transforms the numeric
 *        value.
 * @param {(name: string, type: string) => string} options.formatTypeError
 *        Factory for the error message when a non-numeric type is provided.
 * @returns {number | undefined} The normalized numeric value, or `undefined`
 *          when the input should be treated as absent.
 */
export function normalizeNumericOption(
    rawValue,
    { optionName, coerce, formatTypeError }
) {
    if (rawValue == null) {
        return;
    }

    const rawType = typeof rawValue;
    const isString = rawType === "string";

    if (rawType !== "number" && !isString) {
        throw new Error(formatTypeError(optionName, rawType));
    }

    const normalized = isString ? rawValue.trim() : rawValue;
    if (isString && normalized === "") {
        return;
    }

    const received = isString ? `'${rawValue}'` : normalized;
    const numericValue = isString ? Number(normalized) : normalized;

    return coerce(numericValue, {
        optionName,
        rawType,
        rawValue,
        received,
        isString
    });
}
