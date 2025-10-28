import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyStandardCommandOptions } from "../src/core/command-standard-options.js";

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

    configureOutput(configuration) {
        this.calls.push(["configureOutput", configuration]);
        return this;
    }
}

describe("applyStandardCommandOptions", () => {
    it("applies the shared CLI command defaults", () => {
        const command = new FakeCommand();
        const configured = applyStandardCommandOptions(command);

        assert.equal(configured, command);
        assert.deepEqual(
            configured.calls.map(([name]) => name),
            [
                "exitOverride",
                "allowExcessArguments",
                "helpOption",
                "showHelpAfterError",
                "configureOutput"
            ]
        );

        const [, options] = configured.calls[4];
        assert.equal(typeof options.writeErr, "function");
        assert.equal(typeof options.outputError, "function");
        assert.strictEqual(options.writeErr, options.outputError);
    });

    it("throws when invoked without a valid command", () => {
        assert.throws(() => applyStandardCommandOptions(null), {
            name: "TypeError"
        });
    });
});
