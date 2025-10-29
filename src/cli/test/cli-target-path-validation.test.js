import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { CliUsageError } from "../src/core/errors.js";
import { SKIP_CLI_RUN_ENV_VAR } from "../src/shared/dependencies.js";

const originalSkipFlag = process.env[SKIP_CLI_RUN_ENV_VAR];
process.env[SKIP_CLI_RUN_ENV_VAR] = "1";

const cliModule = await import("../src/cli.js");
const { validateTargetPathInputForTests, resolveTargetPathFromInputForTests } =
    cliModule.__test__;

if (originalSkipFlag === undefined) {
    delete process.env[SKIP_CLI_RUN_ENV_VAR];
} else {
    process.env[SKIP_CLI_RUN_ENV_VAR] = originalSkipFlag;
}

test("validateTargetPathInput rejects non-string values", () => {
    const usage = "usage summary";

    assert.throws(
        () =>
            validateTargetPathInputForTests({
                targetPathProvided: true,
                targetPathInput: { path: "src" },
                usage
            }),
        (error) => {
            assert.ok(error instanceof CliUsageError);
            assert.strictEqual(
                error.message,
                "Target path must be provided as a string. Received a plain object."
            );
            assert.strictEqual(error.usage, usage);
            return true;
        }
    );
});

test("target path helpers normalize valid inputs", () => {
    assert.doesNotThrow(() =>
        validateTargetPathInputForTests({
            targetPathProvided: true,
            targetPathInput: "src",
            usage: ""
        })
    );

    const resolvedTarget = resolveTargetPathFromInputForTests("src");
    assert.strictEqual(resolvedTarget, path.resolve(process.cwd(), "src"));

    const defaultTarget = resolveTargetPathFromInputForTests(null);
    assert.strictEqual(defaultTarget, path.resolve(process.cwd(), "."));
});
