import { normalizeEnumeratedOption } from "../dependencies.js";

function defaultDescribeValue(value) {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
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
    values,
    { coerce, describeValue = defaultDescribeValue, formatErrorMessage } = {}
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

        let message;
        if (typeof createErrorMessage === "function") {
            message = createErrorMessage(value, { list: listLabel, received });
        } else if (createErrorMessage != null) {
            message = String(createErrorMessage);
        } else if (typeof formatErrorMessage === "function") {
            message = formatErrorMessage({ list: listLabel, value, received });
        } else {
            message = `Value must be one of: ${listLabel}. Received: ${received}.`;
        }

        throw new ErrorConstructor(message);
    }

    return Object.freeze({
        valueSet: validValues,
        formatList,
        normalize,
        requireValue
    });
}
