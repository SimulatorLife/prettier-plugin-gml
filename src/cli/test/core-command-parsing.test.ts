import assert from "node:assert/strict";

import { describe, it } from "node:test";
import { Command, InvalidArgumentError } from "commander";

import {
    parseCommandLine,
    wrapInvalidArgumentResolver
} from "../src/cli-core/command-parsing.js";
import { isCliUsageError } from "../src/cli-core/errors.js";
import { Core } from "@gml-modules/core";

const { isObjectLike } = Core;

const createTestCommand = () => {
    return new Command().exitOverride().allowExcessArguments(false);
};

void describe("parseCommandLine", () => {
    void it("parses arguments and exposes command state", () => {
        const command = createTestCommand()
            .argument("<value>")
            .option("--flag");

        const result = parseCommandLine(command, ["--flag", "example"]);

        assert.strictEqual(result.helpRequested, false);
        assert.ok(result.usage.includes("Usage"));

        const options = command.opts();
        const [value] = command.processedArgs;
        assert.strictEqual(options.flag, true);
        assert.strictEqual(value, "example");
    });

    void it("returns help metadata when the user requests help", () => {
        const command = createTestCommand().option("--flag");

        const result = parseCommandLine(command, ["--help"]);

        assert.strictEqual(result.helpRequested, true);
        assert.ok(result.usage.includes("--flag"));
    });

    void it("wraps Commander usage errors as CliUsageError instances", () => {
        const command = createTestCommand().option("--flag");

        assert.throws(
            () => parseCommandLine(command, ["--unknown", "value"]),
            (error) =>
                isCliUsageError(error) &&
                error.message.includes("unknown option") &&
                typeof error.usage === "string"
        );
    });

    void it("supports Commander-style errors without Error prototypes", () => {
        interface MinimalCommanderError extends Error {
            code: string;
        }

        const command = {
            parse() {
                const commanderError = new Error(
                    "bad option"
                ) as MinimalCommanderError;
                commanderError.name = "CommanderError";
                commanderError.code = "commander.invalidOption";
                Object.setPrototypeOf(commanderError, null);

                throw commanderError;
            },
            helpInformation() {
                return "usage info";
            }
        };

        assert.throws(
            () => parseCommandLine(command, []),
            (error) =>
                isCliUsageError(error) &&
                error.message === "bad option" &&
                error.usage === "usage info"
        );
    });
});

void describe("wrapInvalidArgumentResolver", () => {
    void it("returns the resolver result when no error is thrown", () => {
        const resolver = wrapInvalidArgumentResolver((value: string) =>
            value.toUpperCase()
        );

        assert.strictEqual(resolver("value"), "VALUE");
    });

    void it("wraps thrown errors as InvalidArgumentError instances", () => {
        const resolver = wrapInvalidArgumentResolver((value) => {
            if (value !== "ok") {
                throw new TypeError("invalid value");
            }

            return value;
        });

        assert.throws(
            () => resolver("nope"),
            (error) =>
                error instanceof InvalidArgumentError &&
                error.message === "invalid value" &&
                error.cause instanceof TypeError
        );
    });

    void it("applies the fallback message when the thrown value lacks a message", () => {
        const fallback = "Invalid option value.";
        const resolver = wrapInvalidArgumentResolver(
            () => {
                const reasonError = new Error("bad input");
                const reasonObject = reasonError as unknown as Record<
                    string,
                    unknown
                >;
                delete reasonObject.message;
                reasonObject.reason = "bad input";
                throw reasonError;
            },
            { fallbackMessage: fallback }
        );

        assert.throws(
            () => resolver("value"),
            (error) => {
                if (!(error instanceof InvalidArgumentError)) {
                    return false;
                }
                const causeObject = isObjectLike(error.cause)
                    ? (error.cause as Record<string, unknown>)
                    : null;
                if (!causeObject || !("reason" in causeObject)) {
                    return false;
                }
                return (
                    (causeObject.reason as string) === "bad input" &&
                    error.message === fallback
                );
            }
        );
    });

    void it("supports custom error constructors", () => {
        class CustomInvalidArgumentError extends Error {}

        const resolver = wrapInvalidArgumentResolver(
            () => {
                throw new Error("bad news");
            },
            { errorConstructor: CustomInvalidArgumentError }
        );

        assert.throws(
            () => resolver("value"),
            (error) =>
                error instanceof CustomInvalidArgumentError &&
                error.message === "bad news" &&
                error.cause instanceof Error
        );
    });
});
