import assert from "node:assert/strict";
import { test } from "node:test";

import { Command } from "commander";

import { createCliCommandManager } from "../core/command-manager.js";
import { CliUsageError } from "../core/errors.js";
import { applyStandardCommandOptions } from "../core/command-standard-options.js";

test("default command usage is reported for option parsing errors", async () => {
    const program = applyStandardCommandOptions(new Command());
    const unhandledErrors = [];
    const { registry, runner } = createCliCommandManager({
        program,
        onUnhandledError: (error, context) => {
            unhandledErrors.push({ error, command: context.command });
        }
    });

    const capturedErrors = [];
    const defaultCommand = applyStandardCommandOptions(new Command("format"));
    defaultCommand.option("--extensions <list>");

    registry.registerDefaultCommand({
        command: defaultCommand,
        onError: (error, context) => {
            capturedErrors.push({ error, command: context.command });
        }
    });

    await runner.run(["format", "--extensions"]);

    assert.deepStrictEqual(unhandledErrors, []);
    assert.strictEqual(capturedErrors.length, 1);

    const [{ error, command }] = capturedErrors;
    assert.ok(error instanceof CliUsageError);
    assert.strictEqual(command.name(), "format");
    assert.ok(error.usage?.includes("format"));
    assert.ok(error.usage?.includes("--extensions"));
});
