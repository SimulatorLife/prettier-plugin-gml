import { CliUsageError } from "./cli-errors.js";

/**
 * Parse CLI arguments for a Commander.js command while normalizing help and
 * usage errors.
 *
 * @param {import("commander").Command} command
 * @param {Array<string>} args
 * @returns {{ helpRequested: boolean, usage: string }}
 */
export function parseCommandLine(command, args) {
    try {
        command.parse(args, { from: "user" });
        return {
            helpRequested: false,
            usage: command.helpInformation()
        };
    } catch (error) {
        if (error?.code === "commander.helpDisplayed") {
            return {
                helpRequested: true,
                usage: command.helpInformation()
            };
        }

        if (error instanceof Error && error.name === "CommanderError") {
            throw new CliUsageError(error.message.trim(), {
                usage: command.helpInformation()
            });
        }

        throw error;
    }
}

const DEFAULT_PARSE_STRING = (text) => Number.parseInt(text, 10);

function coerceInteger(value, { min, received, createErrorMessage }) {
    if (Number.isFinite(value)) {
        const normalized = Math.trunc(value);
        if (normalized >= min) {
            return normalized;
        }
    }

    const formattedReceived = received ?? value;
    const message =
        typeof createErrorMessage === "function"
            ? createErrorMessage(formattedReceived)
            : (createErrorMessage ??
              `Value must be an integer greater than or equal to ${min} (received ${formattedReceived}).`);

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
        const trimmed = rawValue.trim();
        if (trimmed === "" && blankStringReturnsDefault) {
            return defaultValue;
        }

        const parsed = parseString(trimmed, 10);
        return coerce(parsed, { received: `'${rawValue}'` });
    }

    const type = typeof rawValue;
    const message =
        typeof typeErrorMessage === "function"
            ? typeErrorMessage(type)
            : (typeErrorMessage ??
              `Value must be provided as a number (received type '${type}').`);

    throw new TypeError(message);
}
