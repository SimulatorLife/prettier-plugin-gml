import { toNormalizedInteger } from "./number.js";

const DECIMAL_INTEGER_PATTERN = /^[-+]?\d+/u;
const DECIMAL_RADIX = 10;

const DEFAULT_PARSE_STRING = (text) => {
    const match = DECIMAL_INTEGER_PATTERN.exec(String(text));
    return match ? Number(match[0]) : Number.NaN;
};

function missingOptionValue() {
    return void 0;
}

function parseStringOption(
    rawValue,
    { defaultValue, coerce, parseString, blankStringReturnsDefault }
) {
    const trimmed = rawValue.trim();
    if (trimmed === "" && blankStringReturnsDefault) {
        return defaultValue;
    }

    const parsed = parseString(trimmed, DECIMAL_RADIX);
    return coerce(parsed, { received: `'${rawValue}'` });
}

function createTypeErrorMessage(typeErrorMessage, type) {
    if (typeof typeErrorMessage === "function") {
        return typeErrorMessage(type);
    }

    if (typeof typeErrorMessage === "string") {
        return typeErrorMessage;
    }

    return `Value must be provided as a number (received type '${type}').`;
}

function coerceInteger(value, { min, received, createErrorMessage }) {
    const normalized = toNormalizedInteger(value);
    if (normalized !== null && normalized >= min) {
        return normalized;
    }

    const formattedReceived = received ?? value;
    const fallbackMessage = `Value must be an integer greater than or equal to ${min} (received ${formattedReceived}).`;

    const message =
        typeof createErrorMessage === "function"
            ? createErrorMessage(formattedReceived)
            : (createErrorMessage ?? fallbackMessage);

    throw new TypeError(message);
}

export function coercePositiveInteger(value, options = {}) {
    return coerceInteger(value, {
        min: 1,
        ...options
    });
}

export function coerceNonNegativeInteger(value, options = {}) {
    return coerceInteger(value, {
        min: 0,
        ...options
    });
}

export function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    let candidate = value;

    if (typeof candidate === "string") {
        const trimmed = candidate.trim();

        if (trimmed === "") {
            return defaultValue;
        }

        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
            return defaultValue;
        }

        candidate = parsed;
    }

    const normalized = toNormalizedInteger(candidate);

    if (normalized === null) {
        return defaultValue;
    }

    if (normalized > 0) {
        return normalized;
    }

    if (normalized === 0 && zeroReplacement !== undefined) {
        return zeroReplacement;
    }

    return defaultValue;
}

export function resolveIntegerOption(
    rawValue,
    {
        defaultValue,
        coerce,
        parseString = DEFAULT_PARSE_STRING,
        typeErrorMessage,
        blankStringReturnsDefault = true
    } = {}
) {
    if (rawValue === undefined || rawValue === null) {
        return defaultValue;
    }

    if (typeof rawValue === "number") {
        return coerce(rawValue, { received: rawValue });
    }

    if (typeof rawValue === "string") {
        return parseStringOption(rawValue, {
            defaultValue,
            coerce,
            parseString,
            blankStringReturnsDefault
        });
    }

    const type = typeof rawValue;
    throw new TypeError(createTypeErrorMessage(typeErrorMessage, type));
}

export function normalizeNumericOption(
    rawValue,
    { optionName, coerce, formatTypeError }
) {
    if (rawValue === undefined || rawValue === null) {
        return missingOptionValue();
    }

    const rawType = typeof rawValue;
    const isString = rawType === "string";

    if (rawType !== "number" && !isString) {
        throw new Error(formatTypeError(optionName, rawType));
    }

    const normalized = isString ? rawValue.trim() : rawValue;
    if (isString && normalized === "") {
        return missingOptionValue();
    }

    const received = isString ? `'${rawValue}'` : normalized;
    const numericValue = isString ? Number(normalized) : normalized;

    return coerce(numericValue, {
        optionName,
        rawType,
        rawValue,
        received,
        isString
    });
}

export function createNumericTypeErrorFormatter(label) {
    return (type) =>
        `${label} must be provided as a number (received type '${type}').`;
}
