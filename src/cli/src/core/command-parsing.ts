import type { Command } from "commander";

import { CliUsageError } from "./errors.js";
import { isCommanderErrorLike } from "./commander-error-utils.js";
import {
    assertFunction,
    InvalidArgumentError,
    getErrorMessage
} from "../shared/dependencies.js";

type InvalidArgumentResolver = (
    value: unknown,
    ...rest: Array<unknown>
) => unknown;

interface WrapInvalidArgumentResolverOptions {
    errorConstructor?: new (message: string) => Error;
    fallbackMessage?: string;
}

export interface ParseCommandLineResult {
    helpRequested: boolean;
    usage: string;
}

function isCommanderError(error: unknown) {
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
    resolver: InvalidArgumentResolver,
    options: WrapInvalidArgumentResolverOptions = {}
): InvalidArgumentResolver {
    assertFunction(resolver, "resolver");

    const { errorConstructor, fallbackMessage = "Invalid option value." } =
        options;

    const InvalidArgumentErrorConstructor =
        typeof errorConstructor === "function"
            ? errorConstructor
            : InvalidArgumentError;

    return (...args: Parameters<InvalidArgumentResolver>) => {
        try {
            return resolver(...args);
        } catch (error) {
            const message =
                getErrorMessage(error, { fallback: fallbackMessage }) ||
                fallbackMessage;
            const invalidArgumentError = new InvalidArgumentErrorConstructor(
                message
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
export function parseCommandLine(
    command: Command,
    args: Array<string>
): ParseCommandLineResult {
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
