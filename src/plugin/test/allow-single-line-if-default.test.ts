import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("expands single-line if statements by default", async () => {
    const source = "if (global.debug) { exit; }";

    const formatted = await Plugin.format(source);

    assert.strictEqual(
        formatted,
        ["if (global.debug) {", "    exit;", "}", ""].join("\n")
    );
});

void test("preserves compact return guards inside functions when disabled", async () => {
    const source = [
        "function guard_example() {",
        "    if (global.debug) return;",
        "    return 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function guard_example",
            "function guard_example() {",
            "    if (global.debug) { return; }",
            "    return 1;",
            "}",
            ""
        ].join("\n")
    );
});

void test("expands guarded returns with values when single-line is disabled", async () => {
    const source = [
        "function guard_with_value() {",
        "    if (should_stop()) return false;",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function guard_with_value",
            "function guard_with_value() {",
            "    if (should_stop()) {",
            "        return false;",
            "    }",
            "    return true;",
            "}",
            ""
        ].join("\n")
    );
});
