import assert from "node:assert/strict";
import { test } from "node:test";

import { Command } from "commander";

import { createCliCommandManager } from "../src/core/command-manager.js";
import { CliUsageError } from "../src/core/errors.js";
import { applyStandardCommandOptions } from "../src/core/command-standard-options.js";

function createStubProgram() {
    const hooks = new Map();
    const registeredCommands = [];
    return {
        parseCalls: [],
        addCommand(
            command,
            options: { isDefault?: boolean } = {}
        ): typeof this {
            registeredCommands.push({ command, options });
            if (options.isDefault) {
                this.defaultCommand = command;
            }
            return this;
        },
        hook(name, handler) {
            hooks.set(name, handler);
            return this;
        },
        parse(argv, options) {
            this.parseCalls.push({ argv, options });
            const nonDefault = registeredCommands.find(
                (entry) => entry.options?.isDefault !== true
            );
            const targetCommand =
                nonDefault?.command ?? this.defaultCommand ?? null;
            const action = targetCommand?._actionHandler;
            if (!action) {
                return;
            }

            hooks.get("preSubcommand")?.(this, targetCommand);
            return Promise.resolve()
                .then(() => action(argv.slice(1), targetCommand))
                .finally(() => {
                    hooks.get("postAction")?.();
                });
        },
        helpInformation() {
            return "stub program usage";
        }
    };
}

function createStubCommand(name) {
    return {
        _actionHandler: null,
        action(handler) {
            this._actionHandler = handler;
            return this;
        },
        helpInformation() {
            return `${name} usage`;
        },
        name() {
            return name;
        }
    };
}

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

test("command manager adapts programs that only expose parse()", async () => {
    const program = createStubProgram();
    const { registry, runner } = createCliCommandManager({ program });

    const executed = [];
    const command = createStubCommand("adapter");

    registry.registerCommand({
        command,
        run: () => {
            executed.push("run");
            return 0;
        }
    });

    await runner.run(["adapter", "--flag"]);

    assert.deepStrictEqual(program.parseCalls, [
        { argv: ["adapter", "--flag"], options: { from: "user" } }
    ]);
    assert.deepStrictEqual(executed, ["run"]);
});
