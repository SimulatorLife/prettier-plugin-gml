import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("does not emit binary-expression debug logs while formatting", async (testContext) => {
    const source = "var value = (1 + 2) * 3;\n";
    const messages: string[] = [];

    testContext.mock.method(console, "log", (...args: unknown[]) => {
        messages.push(args.map(String).join(" "));
    });

    await Format.format(source);

    assert.deepStrictEqual(messages, []);
});
