import { assertFunctionProperties } from "./object.js";
import { isNonEmptyString, toNormalizedLowerCaseString } from "./string.js";

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
 * @param {object} [options]
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
    assertFunctionProperties(validValues, ["has"], {
        name: "validValues",
        errorMessage: "validValues must provide a has function"
    });

    if (value === undefined || value === null) {
        return fallbackValue;
    }

    const normalized = coerce(value);

    if (!isNonEmptyString(normalized)) {
        return fallbackValue;
    }

    return validValues.has(normalized) ? normalized : null;
}
