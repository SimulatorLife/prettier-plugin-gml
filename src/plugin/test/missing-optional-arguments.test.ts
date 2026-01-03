import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

const SOURCE_LINES = ["function demo() {", "    return func(1,,3);", "}", ""];

const DEFAULT_FORMATTED = ["function demo() {", "    return func(1, undefined, 3);", "}", ""].join("\n");

void test("prints undefined for missing optional arguments by default", async () => {
    const formatted = await Plugin.format(SOURCE_LINES.join("\n"));
    assert.strictEqual(formatted, DEFAULT_FORMATTED);
});

void test("plugin no longer exposes removed options", async () => {
    for (const optionName of ["missingOptionalArgumentPlaceholder", "allowTrailingCallArguments"]) {
        assert.ok(!Object.hasOwn(Plugin.options, optionName), `${optionName} must be absent from plugin metadata`);
        assert.ok(
            !Object.hasOwn(Plugin.defaultOptions, optionName),
            `${optionName} must be absent from plugin defaults`
        );
    }
});

void test("collapses redundant missing optional arguments when no values are provided", async () => {
    const formatted = await Plugin.format(["my_func4(,);", ""].join("\n"));

    assert.strictEqual(formatted, "my_func4(undefined);\n");
});
