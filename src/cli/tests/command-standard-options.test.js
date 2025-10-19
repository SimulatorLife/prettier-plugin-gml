import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    applyStandardCommandOptions,
    DEFAULT_HELP_AFTER_ERROR,
    DEFAULT_HELP_DESCRIPTION,
    DEFAULT_HELP_FLAG
} from "../lib/command-standard-options.js";

class FakeCommand {
    constructor() {
        this.calls = [];
    }

    exitOverride() {
        this.calls.push(["exitOverride"]);
        return this;
    }

    allowExcessArguments(value) {
        this.calls.push(["allowExcessArguments", value]);
        return this;
    }

    helpOption(flag, description) {
        this.calls.push(["helpOption", flag, description]);
        return this;
    }

    showHelpAfterError(message) {
        this.calls.push(["showHelpAfterError", message]);
        return this;
    }
}

describe("applyStandardCommandOptions", () => {
    it("applies the shared CLI command defaults", () => {
        const command = new FakeCommand();
        const configured = applyStandardCommandOptions(command);

        assert.equal(configured, command);
        assert.deepEqual(configured.calls, [
            ["exitOverride"],
            ["allowExcessArguments", false],
            ["helpOption", DEFAULT_HELP_FLAG, DEFAULT_HELP_DESCRIPTION],
            ["showHelpAfterError", DEFAULT_HELP_AFTER_ERROR]
        ]);
    });

    it("throws when invoked without a valid command", () => {
        assert.throws(() => applyStandardCommandOptions(null), {
            name: "TypeError"
        });
    });
});
