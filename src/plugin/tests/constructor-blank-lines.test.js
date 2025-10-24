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

test("preserves blank lines after documented nested functions inside constructors", async () => {
    const source = [
        "function Demo() constructor {",
        "    /// @function nested",
        "    /// @returns {real}",
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
        "Expected documented nested constructor functions to retain their trailing blank line before the constructor closes."
    );
});
