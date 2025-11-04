import { normalizeEnumeratedOption } from "./dependencies.js";

/**
 * Create standardized enumerated option helpers that reduce boilerplate across
 * option modules.
 *
 * Many plugin options follow the same pattern: define an enum, create a set
 * for validation, format a list for error messages, and provide validation
 * functions. This factory consolidates that repeated setup into a single call,
 * ensuring consistency while allowing customization when needed.
 *
 * @template {Record<string, string>} TEnum
 * @param {TEnum} enumObject Frozen object mapping enum keys to string values.
 * @param {object} [options]
 * @param {string} [options.optionName] Human-readable name used in error
 *        messages (e.g., "Trailing comma override").
 * @param {string} [options.defaultValue] Default value when option is omitted.
 * @param {(value: unknown) => string} [options.coerce] Custom coercion
 *        function applied before validation.
 * @returns {{
 *   values: ReadonlyArray<TEnum[keyof TEnum]>,
 *   set: ReadonlySet<TEnum[keyof TEnum]>,
 *   list: string,
 *   isValid: (value: unknown) => value is TEnum[keyof TEnum],
 *   assert: (value: unknown) => TEnum[keyof TEnum],
 *   normalize: (value: unknown) => TEnum[keyof TEnum] | null
 * }}
 */
export function createEnumeratedOptionHelpers(
    enumObject,
    { optionName, defaultValue, coerce } = {}
) {
    const values = Object.freeze(Object.values(enumObject));
    const set = new Set(values);
    const list = values.join(", ");

    /**
     * Check whether the provided value matches one of the valid enum values.
     *
     * @param {unknown} value Candidate option value to inspect.
     * @returns {value is TEnum[keyof TEnum]} `true` when the value is valid.
     */
    function isValid(value) {
        return typeof value === "string" && set.has(value);
    }

    /**
     * Assert that the provided value is valid, throwing a TypeError if not.
     *
     * @param {unknown} value Candidate option value to validate.
     * @returns {TEnum[keyof TEnum]} The validated value.
     * @throws {TypeError} When the value is invalid.
     */
    function assert(value) {
        if (isValid(value)) {
            return value;
        }

        const prefix = optionName ? `${optionName} must` : "Value must";
        const received =
            typeof value === "string" ? value : String(value ?? "undefined");

        throw new TypeError(
            `${prefix} be one of: ${list}. Received: ${received}.`
        );
    }

    /**
     * Normalize a user-provided option value into a canonical form.
     *
     * @param {unknown} value Untrusted option value supplied by the caller.
     * @returns {TEnum[keyof TEnum] | null} Normalized value when valid,
     *          default value when undefined, or `null` when invalid.
     */
    function normalize(value) {
        if (value === undefined && defaultValue !== undefined) {
            return defaultValue;
        }

        const normalizationOptions = coerce ? { coerce } : undefined;
        return normalizeEnumeratedOption(
            value,
            null,
            set,
            normalizationOptions
        );
    }

    return Object.freeze({
        values,
        set,
        list,
        isValid,
        assert,
        normalize
    });
}
