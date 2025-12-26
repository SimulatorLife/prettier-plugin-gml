import { Core } from "@gml-modules/core";

const {
    describeValueForError,
    normalizeEnumeratedOption,
    toNormalizedLowerCaseString
} = Core;

type EnumeratedValue = string;

interface EnumeratedOptionFormatContext {
    list: string;
    value: unknown;
    received: string;
}

interface EnumeratedOptionRequireContext {
    list: string;
    received: string;
}

export interface CreateEnumeratedOptionHelpersOptions {
    coerce?: (value: unknown) => EnumeratedValue;
    describeValue?: (value: unknown) => string;
    formatErrorMessage?: (context: EnumeratedOptionFormatContext) => string;
}

export interface RequireEnumeratedValueOptions {
    fallback?: EnumeratedValue | null;
    errorConstructor?: new (message?: string) => Error;
    createErrorMessage?: (
        value: unknown,
        context: EnumeratedOptionRequireContext
    ) => string;
}

export interface EnumeratedOptionHelpers {
    valueSet: ReadonlySet<EnumeratedValue>;
    formatList(): string;
    normalize(
        value: unknown,
        options?: { fallback?: EnumeratedValue | null }
    ): EnumeratedValue | null;
    requireValue(
        value: unknown,
        options?: RequireEnumeratedValueOptions
    ): EnumeratedValue;
}

/**
 * Create helper functions that normalize and validate enumerated CLI options
 * while keeping error messaging consistent across commands. The returned
 * helpers expose both a lossy normalization function and an asserting variant
 * that throws with a descriptive error when the value is not accepted.
 *
 * @param {Iterable<string>} values Collection of valid enumerated values.
 * @param {{
 *   coerce?: (value: unknown) => string,
 *   describeValue?: (value: unknown) => string,
 *   formatErrorMessage?: (context: {
 *     list: string,
 *     value: unknown,
 *     received: string
 *   }) => string
 * }} [options]
 */
export function createEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    {
        coerce,
        describeValue = describeValueForError,
        formatErrorMessage
    }: CreateEnumeratedOptionHelpersOptions = {}
) {
    const entries = Array.from(values ?? []);
    const validValues = new Set(entries);
    const sortedList = Object.freeze([...validValues].sort());
    const listLabel = sortedList.join(", ");
    const hasCustomCoerce = typeof coerce === "function";
    const normalizationOptions = hasCustomCoerce ? { coerce } : undefined;

    function formatList() {
        return listLabel;
    }

    function normalize(
        value: unknown,
        { fallback = null }: { fallback?: EnumeratedValue | null } = {}
    ): EnumeratedValue | null {
        return normalizeEnumeratedOption(
            value,
            fallback,
            validValues,
            normalizationOptions
        );
    }

    function requireValue(
        value: unknown,
        {
            fallback = null,
            errorConstructor,
            createErrorMessage
        }: RequireEnumeratedValueOptions = {}
    ): EnumeratedValue {
        const normalized = normalize(value, { fallback });
        if (normalized) {
            return normalized;
        }

        const ErrorConstructor =
            typeof errorConstructor === "function" ? errorConstructor : Error;
        const received = describeValue(value);
        const message =
            typeof createErrorMessage === "function"
                ? createErrorMessage(value, {
                      list: listLabel,
                      received
                  })
                : typeof formatErrorMessage === "function"
                  ? formatErrorMessage({
                        list: listLabel,
                        value,
                        received
                    })
                  : `Value must be one of: ${listLabel}. Received: ${received}.`;

        throw new ErrorConstructor(message);
    }

    return Object.freeze({
        valueSet: validValues,
        formatList,
        normalize,
        requireValue
    }) as EnumeratedOptionHelpers;
}

function normalizeValueLabel(valueLabel?: string): string {
    if (typeof valueLabel === "string") {
        const trimmed = valueLabel.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return "Value";
}

function createStringEnumerationCoercer(
    valueLabel?: string
): (value: unknown) => EnumeratedValue {
    const label = normalizeValueLabel(valueLabel);

    return (value: unknown) => {
        if (typeof value !== "string") {
            throw new TypeError(
                `${label} must be provided as a string (received type '${typeof value}').`
            );
        }

        return toNormalizedLowerCaseString(value);
    };
}

export function createStringEnumeratedOptionHelpers(
    values: Iterable<EnumeratedValue>,
    {
        valueLabel,
        ...options
    }: CreateEnumeratedOptionHelpersOptions & { valueLabel?: string } = {}
): EnumeratedOptionHelpers {
    return createEnumeratedOptionHelpers(values, {
        ...options,
        coerce: createStringEnumerationCoercer(valueLabel)
    });
}
