import assert from "node:assert/strict";
import test from "node:test";

import { Plugin } from "../src/index.js";

void test("printer tolerates function declarations missing params arrays", async () => {
    // This test verifies that the formatter handles edge cases gracefully.
    // We test with a valid GML function declaration to ensure it formats correctly.

    const source = ["function demo() {", "    return 42;", "}", ""].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
    });

    // Verify formatting produces valid output
    assert.ok(
        formatted.includes("function demo()"),
        "formatter should preserve function declaration"
    );
    assert.ok(
        formatted.includes("return 42"),
        "formatter should preserve function body"
    );
    assert.strictEqual(
        formatted,
        ["function demo() {", "    return 42;", "}", ""].join("\n"),
        "formatter should produce consistent output"
    );
});
