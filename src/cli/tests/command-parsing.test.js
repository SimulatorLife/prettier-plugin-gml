import assert from "node:assert/strict";

import { describe, it } from "node:test";
import { Command } from "commander";

import { parseCommandLine } from "../lib/command-parsing.js";
import { CliUsageError } from "../lib/cli-errors.js";

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
                error instanceof CliUsageError &&
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
                error instanceof CliUsageError &&
                error.message === "bad option" &&
                error.usage === "usage info"
        );
    });
});
