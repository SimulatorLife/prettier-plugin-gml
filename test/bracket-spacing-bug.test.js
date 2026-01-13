/**
 * Bug test: bracketSpacing option is not respected
 * The plugin should respect the bracketSpacing option from Prettier.
 * When bracketSpacing: false, object literals should be formatted as {x:1}
 * When bracketSpacing: true, object literals should be formatted as { x: 1 }
 */

import { test } from "node:test";
import assert from "node:assert";
import prettier from "prettier";
import { Plugin } from "../src/plugin/dist/index.js";

const testCode = "var obj = {x: 1, y: 2};";

test("bracketSpacing: false should remove spaces inside braces", async () => {
    const formatted = await prettier.format(testCode, {
        parser: "gml-parse",
        plugins: [Plugin],
        bracketSpacing: false
    });

    // Expected: {x:1,y:2} or {x: 1, y: 2} without spaces around braces
    // Currently the plugin ignores this option and always adds spaces
    assert.ok(
        formatted.includes("{x:") || formatted.includes("{x :"),
        `Expected no space after opening brace, but got: ${formatted}`
    );
});

test("bracketSpacing: true should add spaces inside braces", async () => {
    const formatted = await prettier.format(testCode, {
        parser: "gml-parse",
        plugins: [Plugin],
        bracketSpacing: true
    });

    // Expected: { x: 1, y: 2 } with spaces around braces
    assert.ok(
        formatted.includes("{ x:") || formatted.includes("{ x :"),
        `Expected space after opening brace, but got: ${formatted}`
    );
});
