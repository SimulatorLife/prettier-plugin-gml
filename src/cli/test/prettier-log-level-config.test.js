import assert from "node:assert/strict";
import { test } from "node:test";

import { SKIP_CLI_RUN_ENV_VAR } from "../src/shared/dependencies.js";
import {
    PrettierLogLevel,
    PRETTIER_LOG_LEVEL_CHOICE_MESSAGE,
    parsePrettierLogLevel,
    resolvePrettierLogLevel
} from "../src/core/prettier-log-level.js";

const originalSkipFlag = process.env[SKIP_CLI_RUN_ENV_VAR];
process.env[SKIP_CLI_RUN_ENV_VAR] = "1";

const cliModule = await import("../src/cli.js");
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

test("parsePrettierLogLevel normalizes valid inputs", () => {
    assert.strictEqual(parsePrettierLogLevel("WARN"), PrettierLogLevel.WARN);
    assert.strictEqual(
        parsePrettierLogLevel("  debug  "),
        PrettierLogLevel.DEBUG
    );
});

test("parsePrettierLogLevel rejects invalid inputs", () => {
    assert.throws(() => parsePrettierLogLevel(42), {
        name: "TypeError",
        message:
            "Prettier log level must be provided as a string. Received: number."
    });

    assert.throws(() => parsePrettierLogLevel("chatty"), {
        name: "RangeError",
        message: new RegExp(
            `Prettier log level must be one of: ${PRETTIER_LOG_LEVEL_CHOICE_MESSAGE}`
        )
    });
});

test("resolvePrettierLogLevel falls back on invalid values", () => {
    assert.strictEqual(
        resolvePrettierLogLevel(undefined, PrettierLogLevel.INFO),
        PrettierLogLevel.INFO
    );
    assert.strictEqual(
        resolvePrettierLogLevel("chatty", PrettierLogLevel.ERROR),
        PrettierLogLevel.ERROR
    );
});
