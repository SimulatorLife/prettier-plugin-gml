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

export interface EnumeratedOptionConfig {
    values: Iterable<EnumeratedValue>;
    enforceString?: boolean;
    valueLabel?: string;
    formatError?: (list: string, received: string) => string;
}

/**
 * Create helpers for normalizing and validating enumerated CLI options.
 *
 * @param config - Configuration object or iterable of valid values
 * @returns Frozen helper object with validation and normalization methods
 *
 * @example
 * // Basic usage
 * const helpers = createEnumeratedOptionHelpers({ values: ["json", "yaml"] });
 *
 * @example
 * // With string enforcement
 * const helpers = createEnumeratedOptionHelpers({
 *   values: ["json", "yaml"],
 *   enforceString: true,
 *   valueLabel: "Output format"
 * });
 */
export function createEnumeratedOptionHelpers(
    config: EnumeratedOptionConfig | Iterable<EnumeratedValue>
): EnumeratedOptionHelpers {
    const isConfigObject =
        config != null &&
        typeof config === "object" &&
        "values" in config &&
        typeof (config as any).values !== "function";

    const {
        values,
        enforceString = false,
        valueLabel = "Value",
        formatError
    } = isConfigObject
        ? (config)
        : { values: config as Iterable<EnumeratedValue> };

    const valueSet = new Set(Array.from(values));
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
            if (enforceString && typeof value !== "string") {
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
            if (enforceString && typeof value !== "string") {
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

/**
 * Create helpers for string enumerated options with type-safe coercion.
 *
 * This is a convenience wrapper around createEnumeratedOptionHelpers with
 * enforceString: true. Use when you need explicit string type checking.
 *
 * @param values - Collection of valid enumerated values
 * @param valueLabel - Label for the value type (e.g., "Output format")
 * @param formatError - Optional function to format validation error messages
 */
export function createStringEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    valueLabel: string = "Value",
    formatError?: (list: string, received: string) => string
): EnumeratedOptionHelpers {
    return createEnumeratedOptionHelpers({
        values,
        enforceString: true,
        valueLabel,
        formatError
    });
}
