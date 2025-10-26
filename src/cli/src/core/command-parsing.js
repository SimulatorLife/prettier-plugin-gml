import { InvalidArgumentError } from "commander";

import { CliUsageError } from "./errors.js";
import { isCommanderErrorLike } from "./commander-error-utils.js";
import { assertFunction, getErrorMessage } from "../shared/dependencies.js";

function isCommanderError(error) {
    return (
        isCommanderErrorLike(error) && error.code !== "commander.helpDisplayed"
    );
}

export {
    coercePositiveInteger,
    coerceNonNegativeInteger,
    resolveIntegerOption
} from "../shared/dependencies.js";

/**
 * Wrap a Commander option resolver so thrown errors are converted into
 * {@link InvalidArgumentError} instances. Callers can provide a custom error
 * constructor (for example when subclassing Commander) along with an optional
 * fallback message used when the thrown value lacks a descriptive message.
 *
 * @param {(value: unknown, ...rest: Array<unknown>) => unknown} resolver Value
 *        normalizer invoked by Commander when parsing option input.
 * @param {{
 *   errorConstructor?: new (message: string) => Error,
 *   fallbackMessage?: string
 * }} [options]
 * @returns {(value: unknown, ...rest: Array<unknown>) => unknown}
 */
export function wrapInvalidArgumentResolver(
    resolver,
    {
        errorConstructor = InvalidArgumentError,
        fallbackMessage = "Invalid option value."
    } = {}
) {
    assertFunction(resolver, "resolver");

    const ErrorConstructor =
        typeof errorConstructor === "function"
            ? errorConstructor
            : InvalidArgumentError;

    return (...args) => {
        try {
            return resolver(...args);
        } catch (error) {
            const message = getErrorMessage(error, {
                fallback: fallbackMessage
            });
            const invalidArgumentError = new ErrorConstructor(
                message && message.length > 0 ? message : fallbackMessage
            );

            if (error && typeof error === "object") {
                invalidArgumentError.cause = error;
            }

            throw invalidArgumentError;
        }
    };
}

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

        if (isCommanderError(error)) {
            throw new CliUsageError(error.message.trim(), {
                usage: command.helpInformation()
            });
        }

        throw error;
    }
}
