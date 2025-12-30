import { Core } from "@gml-modules/core";

const { describeValueForError, toNormalizedLowerCaseString } = Core;

type EnumeratedValue = string;

export interface EnumeratedOptionHelpers {
    readonly valueSet: ReadonlySet<EnumeratedValue>;
    formatList(): string;
    normalize(
        value: unknown,
        fallback?: EnumeratedValue | null
    ): EnumeratedValue | null;
    requireValue(
        value: unknown,
        errorConstructor?: new (message: string) => Error
    ): EnumeratedValue;
}

/**
 * Create helpers for normalizing and validating enumerated CLI options.
 *
 * Returns helpers with a simpler, more direct API than the previous implementation.
 * The normalize() function accepts an optional fallback value directly as a parameter,
 * and requireValue() takes an optional error constructor.
 *
 * @param values - Collection of valid enumerated values.
 * @param formatError - Optional function to format error messages (receives list and received value).
 */
export function createEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    formatError?: (list: string, received: string) => string
): EnumeratedOptionHelpers {
    const valueSet = new Set(Array.from(values ?? []));
    const listLabel = [...valueSet].sort().join(", ");

    return Object.freeze({
        valueSet,
        formatList: () => listLabel,
        normalize: (
            value: unknown,
            fallback: EnumeratedValue | null = null
        ) => {
            if (value === undefined || value === null) {
                return fallback;
            }
            const normalized = toNormalizedLowerCaseString(value);
            return normalized && valueSet.has(normalized)
                ? normalized
                : fallback;
        },
        requireValue: (
            value: unknown,
            ErrorConstructor: new (message: string) => Error = Error
        ) => {
            const normalized = toNormalizedLowerCaseString(value);
            if (normalized && valueSet.has(normalized)) {
                return normalized;
            }
            const received = describeValueForError(value);
            const message = formatError
                ? formatError(listLabel, received)
                : `Value must be one of: ${listLabel}. Received: ${received}.`;
            throw new ErrorConstructor(message);
        }
    });
}

/**
 * Create helpers for string enumerated options with type-safe coercion.
 *
 * Validates that the input value is a string before normalization. The returned
 * helpers enforce type safety and provide clear error messages when non-string
 * values are provided.
 *
 * @param values - Collection of valid enumerated values.
 * @param valueLabel - Label for the value type (e.g., "Output format"). Defaults to "Value".
 * @param formatError - Optional function to format validation error messages.
 */
export function createStringEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    valueLabel: string = "Value",
    formatError?: (list: string, received: string) => string
): EnumeratedOptionHelpers {
    const valueSet = new Set(Array.from(values ?? []));
    const listLabel = [...valueSet].sort().join(", ");
    const label = valueLabel.trim() || "Value";

    return Object.freeze({
        valueSet,
        formatList: () => listLabel,
        normalize: (
            value: unknown,
            fallback: EnumeratedValue | null = null
        ) => {
            if (value === undefined || value === null) {
                return fallback;
            }
            if (typeof value !== "string") {
                return fallback;
            }
            const normalized = toNormalizedLowerCaseString(value);
            return normalized && valueSet.has(normalized)
                ? normalized
                : fallback;
        },
        requireValue: (
            value: unknown,
            ErrorConstructor: new (message: string) => Error = Error
        ) => {
            if (typeof value !== "string") {
                throw new TypeError(
                    `${label} must be provided as a string (received type '${typeof value}').`
                );
            }
            const normalized = toNormalizedLowerCaseString(value);
            if (normalized && valueSet.has(normalized)) {
                return normalized;
            }
            const received = describeValueForError(value);
            const message = formatError
                ? formatError(listLabel, received)
                : `Value must be one of: ${listLabel}. Received: ${received}.`;
            throw new ErrorConstructor(message);
        }
    });
}
