import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Command, InvalidArgumentError, Option } from "commander";

import {
    createCommanderCommand,
    createCommanderInvalidArgumentError,
    createCommanderOption,
    getCommanderCommandConstructor,
    getCommanderInvalidArgumentErrorConstructor,
    getCommanderOptionConstructor
} from "../src/core/commander-registry.js";

describe("commander helpers", () => {
    it("creates native Commander instances", () => {
        const command = createCommanderCommand("example");
        const option = createCommanderOption("--flag");
        const error = createCommanderInvalidArgumentError("bad value");

        assert.ok(command instanceof Command);
        assert.strictEqual(command.name(), "example");
        assert.ok(option instanceof Option);
        assert.strictEqual(option.flags, "--flag");
        assert.ok(error instanceof InvalidArgumentError);
        assert.strictEqual(error.message, "bad value");
    });

    it("exposes the Commander constructors directly", () => {
        assert.strictEqual(getCommanderCommandConstructor(), Command);
        assert.strictEqual(getCommanderOptionConstructor(), Option);
        assert.strictEqual(
            getCommanderInvalidArgumentErrorConstructor(),
            InvalidArgumentError
        );
    });
});
