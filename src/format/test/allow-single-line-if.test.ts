import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("expands single-line if statements by default", async () => {
    const source = "if (global.debug) { exit; }";

    const formatted = await Format.format(source);

    assert.strictEqual(formatted, ["if (global.debug) {", "    exit;", "}", ""].join("\n"));
});

void test("preserves compact return guards inside functions when disabled", async () => {
    const source = ["function guard_example() {", "    if (global.debug) return;", "    return 1;", "}", ""].join("\n");

    const formatted = await Format.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        ["function guard_example() {", "    if (global.debug) { return; }", "    return 1;", "}", ""].join("\n")
    );
});

void test("expands expression guards inside functions when single-line formatting is disabled", async () => {
    const source = ["function bump_counter() {", "    if (ready) counter += 1;", "    return counter;", "}", ""].join(
        "\n"
    );

    const formatted = await Format.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "function bump_counter() {",
            "    if (ready) {",
            "        counter += 1;",
            "    }",
            "    return counter;",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves blank line after expanding single-line if statement", async () => {
    const source = [
        "function demo(value) {",
        "    var setting = true;",
        "    if (argument_count > 1) setting = argument[1];",
        "",
        "    var nextValue = value + 1;",
        "}",
        ""
    ].join("\n");

    const expected = [
        "function demo(value) {",
        "    var setting = true;",
        "    if (argument_count > 1) {",
        "        setting = argument[1];",
        "    }",
        "",
        "    var nextValue = value + 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source, { allowSingleLineIfStatements: false });

    assert.strictEqual(
        formatted.trim(),
        expected.trim(),
        "Expected the single-line if statement to be expanded with a blank line preserved after it."
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

    const formatted = await Format.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
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

void test("does not force inline bodies when allowSingleLineIfStatements is enabled but the clause exceeds print width", async () => {
    const source = [
        "if (scr_is_matrix_rotated(scr_matrix_build(100, 999, 1000, 90, 90, 90, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1))) { return true; }",
        ""
    ].join("\n");

    const formatted = await Format.format(source, {
        allowSingleLineIfStatements: true,
        printWidth: 115
    });

    assert.strictEqual(
        formatted,
        [
            "if (scr_is_matrix_rotated(scr_matrix_build(100, 999, 1000, 90, 90, 90, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1))) {",
            "    return true;",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves compact one-line block guards inside nested function expressions when disabled", async () => {
    const source = [
        "function outer() {",
        "    var nested = function () {",
        "        if (reset_matrix) { scr_matrix_reset(); }",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "function outer() {",
            "    var nested = function () {",
            "        if (reset_matrix) { scr_matrix_reset(); }",
            "    };",
            "}",
            ""
        ].join("\n")
    );
});
