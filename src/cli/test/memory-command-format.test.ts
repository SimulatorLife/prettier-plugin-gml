import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryCommand } from "../src/modules/memory/index.js";
import { SuiteOutputFormat } from "../src/cli-core/command-suite-helpers.js";
import type { ParseOptions } from "commander";

const USER_PARSE_OPTIONS: ParseOptions = { from: "user" };

void test("memory command accepts valid format values", () => {
    const command = createMemoryCommand({ env: {} });

    command.parse(["--format", SuiteOutputFormat.HUMAN], USER_PARSE_OPTIONS);

    assert.equal(command.opts().format, SuiteOutputFormat.HUMAN);
});

void test("memory command rejects invalid format values", () => {
    const command = createMemoryCommand({ env: {} });

    assert.throws(
        () => command.parse(["--format", "xml"], USER_PARSE_OPTIONS),
        (error) => {
            if (!(error instanceof Error)) {
                return false;
            }
            const withCode = error as Error & { code?: string };
            assert.equal(withCode.code, "commander.invalidArgument");
            assert.match(error.message, /format must be one of/i);
            return true;
        }
    );
});
