import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryCommand } from "../lib/memory-cli.js";
import { SuiteOutputFormat } from "../lib/command-suite-helpers.js";

test("memory command accepts valid format values", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(["--format", SuiteOutputFormat.HUMAN], {
        from: "user"
    });

    assert.equal(command.opts().format, SuiteOutputFormat.HUMAN);
});

test("memory command rejects invalid format values", () => {
    const command = createMemoryCommand({ env: {} });

    assert.throws(
        () =>
            command.parse(["--format", "xml"], {
                from: "user"
            }),
        (error) => {
            assert.equal(error?.code, "commander.invalidArgument");
            assert.match(error.message, /format must be one of/i);
            return true;
        }
    );
});
