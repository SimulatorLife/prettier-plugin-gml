import assert from "node:assert/strict";

import { describe, it } from "node:test";
import { Command, InvalidArgumentError } from "commander";

import {
    parseCommandLine,
    wrapInvalidArgumentResolver
} from "../lib/command-parsing.js";
import { isCliUsageError } from "../lib/cli-errors.js";

describe("parseCommandLine", () => {
    it("parses arguments and exposes command state", () => {
        const command = new Command()
            .exitOverride()
            .allowExcessArguments(false)
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

    it("returns help metadata when the user requests help", () => {
        const command = new Command()
            .exitOverride()
            .allowExcessArguments(false)
            .option("--flag");

        const result = parseCommandLine(command, ["--help"]);

        assert.strictEqual(result.helpRequested, true);
        assert.ok(result.usage.includes("--flag"));
    });

    it("wraps Commander usage errors as CliUsageError instances", () => {
        const command = new Command()
            .exitOverride()
            .allowExcessArguments(false)
            .option("--flag");

        assert.throws(
            () => parseCommandLine(command, ["--unknown", "value"]),
            (error) =>
                isCliUsageError(error) &&
                error.message.includes("unknown option") &&
                typeof error.usage === "string"
        );
    });

    it("supports Commander-style errors without Error prototypes", () => {
        const command = {
            parse() {
                throw {
                    name: "CommanderError",
                    code: "commander.invalidOption",
                    message: "bad option"
                };
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

describe("wrapInvalidArgumentResolver", () => {
    it("returns the resolver result when no error is thrown", () => {
        const resolver = wrapInvalidArgumentResolver((value) =>
            String(value).toUpperCase()
        );

        assert.strictEqual(resolver("value"), "VALUE");
    });

    it("wraps thrown errors as InvalidArgumentError instances", () => {
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

    it("applies the fallback message when the thrown value lacks a message", () => {
        const fallback = "Invalid option value.";
        const resolver = wrapInvalidArgumentResolver(
            () => {
                throw { reason: "bad input" };
            },
            { fallbackMessage: fallback }
        );

        assert.throws(
            () => resolver("value"),
            (error) =>
                error instanceof InvalidArgumentError &&
                error.message === fallback &&
                error.cause &&
                error.cause.reason === "bad input"
        );
    });

    it("supports custom error constructors", () => {
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
