import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("removes blank line between constructor header and first statement", async () => {
    const source = ["function Demo() constructor {", "", "    self.value = 1;", "}", ""].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.notEqual(
        lines[1],
        "",
        "Expected constructors to exclude a blank line when the input separates the header from the first statement."
    );
});

void test("preserves blank line before constructor closing brace", async () => {
    const source = [
        "function Demo() constructor {",
        "    static helper = function () {",
        "        return 1;",
        "    };",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected constructors to retain blank lines between the final statement and closing brace."
    );
});

void test("preserves blank line after documented static constructor members", async () => {
    const source = [
        "function Demo() constructor {",
        "    /// @returns {real}",
        "    static helper = function () {",
        "        return 1;",
        "    };",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected documented static members to retain the blank line before the constructor closes."
    );
});

void test("preserves blank lines after nested function declarations inside constructors", async () => {
    const source = [
        "function Demo() constructor {",
        "",
        "    function nested() {",
        "        return 1;",
        "    }",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected nested function declarations to retain their trailing blank line before the constructor closes."
    );
});

void test("inserts trailing blank line after nested constructor functions when missing", async () => {
    const source = [
        "function Demo() constructor {",
        "    function nested() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected constructor blocks to gain a separating blank line when nested functions close immediately before the brace."
    );
});

void test("preserves blank lines between simple constructor assignments", async () => {
    const source = [
        "Demo = function () constructor {",
        "    self.value = 1;",
        "",
        "    self.copied = self.value;",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);
    const lines = formatted.trim().split("\n");
    const assignmentIndex = lines.indexOf("    self.value = 1;");

    assert.notStrictEqual(
        assignmentIndex,
        -1,
        "Expected the constructor body to contain the first assignment statement."
    );
    assert.equal(
        lines[assignmentIndex + 1],
        "",
        "Expected constructors to preserve author-inserted blank lines between simple assignments."
    );
});
