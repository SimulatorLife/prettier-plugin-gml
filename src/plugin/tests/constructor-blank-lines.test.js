import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("preserves blank line between constructor header and first statement", async () => {
    const source = [
        "function Demo() constructor {",
        "",
        "    self.value = 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines[2],
        "",
        "Expected constructors to retain a blank line when the input separates the header from the first statement."
    );
});

test("preserves blank line before constructor closing brace", async () => {
    const source = [
        "function Demo() constructor {",
        "    static helper = function() {",
        "        return 1;",
        "    };",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected constructors to retain blank lines between the final statement and closing brace."
    );
});

test("preserves blank line after documented static constructor members", async () => {
    const source = [
        "function Demo() constructor {",
        "    /// @function helper",
        "    /// @returns {real}",
        "    static helper = function() {",
        "        return 1;",
        "    };",
        "",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected documented static members to retain the blank line before the constructor closes."
    );
});

test("preserves blank lines after nested function declarations inside constructors", async () => {
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

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected nested function declarations to retain their trailing blank line before the constructor closes."
    );
});

test("adds a blank line after nested function declarations when missing", async () => {
    const source = [
        "function Demo() constructor {",
        "    function nested() {",
        "        return 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected nested function declarations to insert a blank line before the constructor closes."
    );
});

test("collapses blank lines between simple constructor assignments", async () => {
    const source = [
        "Demo = function() constructor {",
        "    self.value = 1;",
        "",
        "    self.copied = self.value;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");
    const assignmentIndex = lines.indexOf("    self.value = 1;");

    assert.notStrictEqual(
        assignmentIndex,
        -1,
        "Expected the constructor body to contain the first assignment statement."
    );
    assert.equal(
        lines[assignmentIndex + 1],
        "    self.copied = self.value;",
        "Expected constructors to collapse author-inserted blank lines between simple assignments."
    );
});

test("inserts blank line after synthetic constructor doc comments", async () => {
    const source = [
        "function Demo() constructor {",
        "    function nested(value) {",
        "        return value;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines.at(-2),
        "",
        "Expected constructors to retain a blank line after nested functions when synthetic doc comments are generated."
    );
});
