const PrettierLogLevel = Object.freeze({
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    SILENT: "silent"
});

const PRETTIER_LOG_LEVEL_VALUES = Object.freeze(
    Object.values(PrettierLogLevel)
);

const PRETTIER_LOG_LEVEL_SET = new Set(PRETTIER_LOG_LEVEL_VALUES);

const PRETTIER_LOG_LEVEL_CHOICES = Object.freeze([
    ...PRETTIER_LOG_LEVEL_VALUES
]);

const PRETTIER_LOG_LEVEL_CHOICE_MESSAGE = PRETTIER_LOG_LEVEL_CHOICES.join(", ");

function formatReceivedValue(value) {
    return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Parse a user-supplied Prettier log level.
 *
 * Normalizes the value to lower-case, trims surrounding whitespace, and
 * validates it against the supported set of log levels. Invalid entries raise
 * descriptive errors so callers can surface actionable feedback.
 *
 * @param {unknown} value Raw log level provided by the caller.
 * @returns {keyof typeof PrettierLogLevel}
 * @throws {TypeError | RangeError} When the value cannot be coerced into a
 *         supported log level.
 */
function parsePrettierLogLevel(value) {
    if (typeof value !== "string") {
        throw new TypeError(
            `Prettier log level must be provided as a string. Received: ${typeof value}.`
        );
    }

    const normalized = value.trim().toLowerCase();

    if (!PRETTIER_LOG_LEVEL_SET.has(normalized)) {
        throw new RangeError(
            `Prettier log level must be one of: ${PRETTIER_LOG_LEVEL_CHOICE_MESSAGE}. Received: ${formatReceivedValue(value)}.`
        );
    }

    return normalized;
}

/**
 * Resolve a log level value while falling back to a default when invalid.
 *
 * @param {unknown} value Candidate log level.
 * @param {keyof typeof PrettierLogLevel} [fallback=PrettierLogLevel.WARN]
 *        Default value returned when the candidate is invalid or absent.
 * @returns {keyof typeof PrettierLogLevel}
 */
function resolvePrettierLogLevel(value, fallback = PrettierLogLevel.WARN) {
    if (value === undefined || value === null) {
        return fallback;
    }

    try {
        return parsePrettierLogLevel(value);
    } catch {
        return fallback;
    }
}

/**
 * Check whether a value is one of the supported Prettier log levels.
 *
 * @param {unknown} value Candidate value to inspect.
 * @returns {value is keyof typeof PrettierLogLevel}
 */
function isPrettierLogLevel(value) {
    return typeof value === "string" && PRETTIER_LOG_LEVEL_SET.has(value);
}

export {
    PrettierLogLevel,
    PRETTIER_LOG_LEVEL_SET,
    PRETTIER_LOG_LEVEL_VALUES,
    PRETTIER_LOG_LEVEL_CHOICES,
    PRETTIER_LOG_LEVEL_CHOICE_MESSAGE,
    isPrettierLogLevel,
    parsePrettierLogLevel,
    resolvePrettierLogLevel
};
