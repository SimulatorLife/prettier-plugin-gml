import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyStandardCommandOptions } from "../src/cli-core/command-standard-options.js";

class FakeCommand {
    calls: Array<[string, ...Array<unknown>]>;

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

void describe("applyStandardCommandOptions", () => {
    void it("applies the shared CLI command defaults", () => {
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
        assert.ok(options && typeof options === "object");
        const outputOptions = options as {
            writeErr?: unknown;
            outputError?: unknown;
        };
        assert.equal(typeof outputOptions.writeErr, "function");
        assert.equal(typeof outputOptions.outputError, "function");
        assert.strictEqual(outputOptions.writeErr, outputOptions.outputError);
    });

    void it("throws when invoked without a valid command", () => {
        assert.throws(() => applyStandardCommandOptions(null), {
            name: "TypeError"
        });
    });
});
