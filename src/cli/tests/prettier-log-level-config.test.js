import assert from "node:assert/strict";
import { test } from "node:test";

import { SKIP_CLI_RUN_ENV_VAR } from "../shared/dependencies.js";

const originalSkipFlag = process.env[SKIP_CLI_RUN_ENV_VAR];
process.env[SKIP_CLI_RUN_ENV_VAR] = "1";

const cliModule = await import("../cli.js");
const { configurePrettierOptionsForTests, getPrettierOptionsForTests } =
    cliModule.__test__;

test("configurePrettierOptions applies the log level Prettier expects", (t) => {
    const originalLogLevel = getPrettierOptionsForTests().logLevel;

    t.after(() => {
        configurePrettierOptionsForTests({ logLevel: originalLogLevel });

        if (originalSkipFlag === undefined) {
            delete process.env[SKIP_CLI_RUN_ENV_VAR];
        } else {
            process.env[SKIP_CLI_RUN_ENV_VAR] = originalSkipFlag;
        }
    });

    configurePrettierOptionsForTests({ logLevel: "silent" });

    assert.strictEqual(getPrettierOptionsForTests().logLevel, "silent");
    assert.strictEqual(getPrettierOptionsForTests().loglevel, undefined);
});
