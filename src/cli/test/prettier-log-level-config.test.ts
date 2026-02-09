import assert from "node:assert/strict";
import { test } from "node:test";

import { __formatTest__ } from "../src/commands/format.js";

const { configurePrettierOptionsForTests, getPrettierOptionsForTests } = __formatTest__;

void test("configurePrettierOptions applies the log level Prettier expects", (t) => {
    const originalLogLevel = getPrettierOptionsForTests().logLevel;

    t.after(() => {
        configurePrettierOptionsForTests({ logLevel: originalLogLevel });
    });

    configurePrettierOptionsForTests({ logLevel: "silent" });

    const options = getPrettierOptionsForTests() as Record<string, unknown>;

    assert.strictEqual(options.logLevel, "silent");
    assert.strictEqual(options.loglevel, undefined);
});
