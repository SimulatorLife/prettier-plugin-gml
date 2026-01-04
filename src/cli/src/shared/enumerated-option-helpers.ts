import { Core } from "@gml-modules/core";

const { describeValueForError, toNormalizedLowerCaseString } = Core;

type EnumeratedValue = string;

export interface EnumeratedOptionHelpers {
    readonly valueSet: ReadonlySet<EnumeratedValue>;
    formatList(): string;
    normalize(value: unknown, fallback?: EnumeratedValue | null): EnumeratedValue | null;
    requireValue(value: unknown, errorConstructor?: new (message: string) => Error): EnumeratedValue;
}

/**
 * Create helpers for normalizing and validating enumerated CLI options.
 *
 * @param values - Array of valid enumerated values
 * @param options - Configuration options
 * @param options.formatError - Optional function to format validation error messages
 * @param options.enforceStringType - If true, rejects non-string inputs early with TypeError
 * @param options.valueLabel - Label for the value type in error messages (only with enforceStringType)
 * @returns Frozen helper object with validation and normalization methods
 *
 * @example
 * // Basic usage
 * const helpers = createEnumeratedOptionHelpers(["json", "yaml"]);
 * helpers.normalize("JSON"); // "json"
 * helpers.requireValue("xml"); // throws Error
 *
 * @example
 * // With string type enforcement
 * const helpers = createEnumeratedOptionHelpers(["json"], {
 *   enforceStringType: true,
 *   valueLabel: "Output format"
 * });
 * helpers.requireValue(42); // throws TypeError
 */
export function createEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    options?:
        | ((list: string, received: string) => string)
        | {
              formatError?: (list: string, received: string) => string;
              enforceStringType?: boolean;
              valueLabel?: string;
          }
): EnumeratedOptionHelpers {
    const formatError = typeof options === "function" ? options : options?.formatError;
    const enforceStringType = typeof options === "object" ? (options.enforceStringType ?? false) : false;
    const valueLabel = typeof options === "object" ? options.valueLabel?.trim() || "Value" : "Value";

    const valueSet = new Set(Array.from(values));
    const listLabel = [...valueSet].sort().join(", ");

    return Object.freeze({
        valueSet,
        formatList: () => listLabel,
        normalize: (value: unknown, fallback: EnumeratedValue | null = null) => {
            if (value == null) {
                return fallback;
            }
            if (enforceStringType && typeof value !== "string") {
                return fallback;
            }
            const normalized = toNormalizedLowerCaseString(value);
            return normalized && valueSet.has(normalized) ? normalized : fallback;
        },
        requireValue: (value: unknown, ErrorConstructor: new (message: string) => Error = Error) => {
            if (enforceStringType && typeof value !== "string") {
                throw new TypeError(`${valueLabel} must be provided as a string (received type '${typeof value}').`);
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
