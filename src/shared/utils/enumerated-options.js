import { toNormalizedLowerCaseString } from "./string.js";

/**
 * Normalize enumerated option values against a set of valid entries.
 *
 * Centralizes the common pattern of accepting optional input, applying a
 * normalization/coercion step, and falling back to a default when the provided
 * value is blank or absent. Callers provide the canonical set of entries to
 * validate against along with any fallback semantics so downstream logic stays
 * focused on option handling rather than defensive guards.
 *
 * @param {unknown} value Raw option value supplied by the caller.
 * @param {unknown} fallbackValue Value returned when the option is omitted or
 *        normalizes to an empty string.
 * @param {{ has(value: string): boolean }} validValues Collection used to
 *        determine whether the normalized value is accepted.
 * @param {Object} [options]
 * @param {(value: unknown) => string} [options.coerce=toNormalizedLowerCaseString]
 *        Normalization function applied before validation.
 * @returns {string | null | unknown} Normalized value when valid, the fallback
 *          when the option is absent/blank, or `null` when the normalized value
 *          is invalid.
 */
export function normalizeEnumeratedOption(
    value,
    fallbackValue,
    validValues,
    { coerce = toNormalizedLowerCaseString } = {}
) {
    if (!validValues || typeof validValues.has !== "function") {
        throw new TypeError("validValues must provide a has function");
    }

    if (value == undefined) {
        return fallbackValue;
    }

    const normalized = coerce(value);

    if (typeof normalized !== "string" || normalized.length === 0) {
        return fallbackValue;
    }

    return validValues.has(normalized) ? normalized : null;
}
