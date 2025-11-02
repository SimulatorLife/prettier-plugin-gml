import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    Command as NativeCommand,
    InvalidArgumentError as NativeInvalidArgumentError,
    Option as NativeOption
} from "commander";

import { Command, InvalidArgumentError, Option } from "../src/dependencies.js";

describe("commander dependencies", () => {
    it("re-exports the native Commander constructors", () => {
        assert.strictEqual(Command, NativeCommand);
        assert.strictEqual(Option, NativeOption);
        assert.strictEqual(InvalidArgumentError, NativeInvalidArgumentError);
    });

    it("constructs Commander instances via the shared exports", () => {
        const command = new Command("example");
        const option = new Option("--flag");
        const error = new InvalidArgumentError("bad value");

        assert.ok(command instanceof NativeCommand);
        assert.strictEqual(command.name(), "example");
        assert.ok(option instanceof NativeOption);
        assert.strictEqual(option.flags, "--flag");
        assert.ok(error instanceof NativeInvalidArgumentError);
        assert.strictEqual(error.message, "bad value");
    });
});
