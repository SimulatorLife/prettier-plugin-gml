/**
 * Bug test: bracketSpacing option is not respected
 * The formatter should respect the bracketSpacing option from Prettier.
 * When bracketSpacing: false, object literals should be formatted as {x:1}
 * When bracketSpacing: true, object literals should be formatted as { x: 1 }
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "@gml-modules/format";
import prettier from "prettier";

const testCode = "var obj = {x: 1, y: 2};";

void test("bracketSpacing: false should remove spaces inside braces", async () => {
    const formatted = await prettier.format(testCode, {
        parser: "gml-parse",
        plugins: [Format],
        bracketSpacing: false
    });

    assert.ok(
        formatted.includes("{x:") || formatted.includes("{x :"),
        `Expected no space after opening brace, but got: ${formatted}`
    );
});

void test("bracketSpacing: true should add spaces inside braces", async () => {
    const formatted = await prettier.format(testCode, {
        parser: "gml-parse",
        plugins: [Format],
        bracketSpacing: true
    });

    assert.ok(
        formatted.includes("{ x:") || formatted.includes("{ x :"),
        `Expected space after opening brace, but got: ${formatted}`
    );
});
