import {
    describeValueForError,
    normalizeEnumeratedOption,
    toNormalizedLowerCaseString
} from "@prettier-plugin-gml/shared";

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
    values,
    { coerce, describeValue = describeValueForError, formatErrorMessage } = {}
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

    function normalize(value, { fallback = null } = {}) {
        return normalizeEnumeratedOption(
            value,
            fallback,
            validValues,
            normalizationOptions
        );
    }

    function requireValue(
        value,
        { fallback = null, errorConstructor, createErrorMessage } = {}
    ) {
        const normalized = normalize(value, { fallback });
        if (normalized) {
            return normalized;
        }

        const ErrorConstructor =
            typeof errorConstructor === "function" ? errorConstructor : Error;
        const received = describeValue(value);

        if (typeof createErrorMessage === "function") {
            const message = createErrorMessage(value, {
                list: listLabel,
                received
            });
            throw new ErrorConstructor(message);
        }

        if (createErrorMessage != null) {
            throw new ErrorConstructor(String(createErrorMessage));
        }

        if (typeof formatErrorMessage === "function") {
            const message = formatErrorMessage({
                list: listLabel,
                value,
                received
            });
            throw new ErrorConstructor(message);
        }

        throw new ErrorConstructor(
            `Value must be one of: ${listLabel}. Received: ${received}.`
        );
    }

    return Object.freeze({
        valueSet: validValues,
        formatList,
        normalize,
        requireValue
    });
}

function normalizeValueLabel(valueLabel) {
    if (typeof valueLabel === "string") {
        const trimmed = valueLabel.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return "Value";
}

function createStringEnumerationCoercer(valueLabel) {
    const label = normalizeValueLabel(valueLabel);

    return (value) => {
        if (typeof value !== "string") {
            throw new TypeError(
                `${label} must be provided as a string (received type '${typeof value}').`
            );
        }

        return toNormalizedLowerCaseString(value);
    };
}

export function createStringEnumeratedOptionHelpers(
    values,
    { valueLabel, ...options } = {}
) {
    return createEnumeratedOptionHelpers(values, {
        ...options,
        coerce: createStringEnumerationCoercer(valueLabel)
    });
}
