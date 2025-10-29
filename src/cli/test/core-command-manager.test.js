import assert from "node:assert/strict";
import { test } from "node:test";

import { Command } from "commander";

import { createCliCommandManager } from "../src/core/command-manager.js";
import { CliUsageError } from "../src/core/errors.js";
import { applyStandardCommandOptions } from "../src/core/command-standard-options.js";

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

test("subcommand usage is reported when Commander omits command reference", async () => {
    const program = applyStandardCommandOptions(new Command());
    const unhandledErrors = [];
    const { registry, runner } = createCliCommandManager({
        program,
        onUnhandledError: (error, context) => {
            unhandledErrors.push({ error, command: context.command });
        }
    });

    const defaultCommand = applyStandardCommandOptions(new Command("format"));
    registry.registerDefaultCommand({ command: defaultCommand });

    const capturedErrors = [];
    const performanceCommand = applyStandardCommandOptions(
        new Command("performance")
    );
    performanceCommand.option("--stdout");

    registry.registerCommand({
        command: performanceCommand,
        onError: (error, context) => {
            capturedErrors.push({ error, command: context.command });
        }
    });

    await runner.run(["performance", "--stdout", "human"]);

    assert.deepStrictEqual(unhandledErrors, []);
    assert.strictEqual(capturedErrors.length, 1);

    const [{ error, command }] = capturedErrors;
    assert.ok(error instanceof CliUsageError);
    assert.strictEqual(command.name(), "performance");
    assert.ok(error.message.includes("performance"));
    assert.ok(error.usage?.includes("performance"));
    assert.ok(error.usage?.includes("--stdout"));
});
