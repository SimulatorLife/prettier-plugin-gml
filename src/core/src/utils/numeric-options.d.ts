export declare function coercePositiveInteger(value: any, options?: {}): number;
export declare function coerceNonNegativeInteger(value: any, options?: {}): number;
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
 * @param {object} [options]
 * @param {number} [options.zeroReplacement] Replacement to use when the
 *                                           normalized value is exactly zero.
 * @returns {number} Either the coerced positive integer, the zero
 *                   replacement, or `defaultValue` when the input is blank.
 */
export declare function coercePositiveIntegerOption(value: any, defaultValue: any, { zeroReplacement }?: {}): any;
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
 * @param {object} [options]
 * @param {number} [options.defaultValue] Fallback when the option is missing.
 * @param {(value: number, options: object) => number} options.coerce Function
 *        invoked with the parsed number and context to validate range or
 *        return alternate values.
 * @param {(text: string) => number} [options.parseString] Custom parser for
 *        string inputs, e.g. to support hex or binary notation. Defaults to
 *        {@link DEFAULT_PARSE_STRING}.
 * @param {string | ((type: string) => string)} [options.typeErrorMessage]
 *        Overrides the error message when a non-number, non-string value is
 *        provided.
 * @param {boolean} [options.blankStringReturnsDefault=true] When `true`, blank
 *        strings short-circuit to the default; otherwise they are parsed.
 * @returns {number | undefined} The coerced numeric option value.
 */
export declare function resolveIntegerOption(rawValue: any, { defaultValue, coerce, parseString, typeErrorMessage, blankStringReturnsDefault }?: {
    parseString?: (text: any) => number;
    blankStringReturnsDefault?: boolean;
}): any;
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
 * @param {object} options
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
export declare function normalizeNumericOption(rawValue: any, { optionName, coerce, formatTypeError }: {
    optionName: any;
    coerce: any;
    formatTypeError: any;
}): any;
/**
 * Create a type error message formatter for numeric options. Centralizes the
 * pattern used across CLI modules where option validators need to report when
 * a non-numeric type is provided. The returned function accepts the type name
 * and yields a descriptive error message.
 *
 * @param {string} label Human-readable option name (e.g., "Progress bar width",
 *        "VM evaluation timeout").
 * @returns {(type: string) => string} Formatter that accepts a type name and
 *          returns the error message.
 */
export declare function createNumericTypeErrorFormatter(label: any): (type: any) => string;
