import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = (() => {
    const candidates = [
        path.resolve(currentDirectory, "../dist/src/index.js"),
        path.resolve(currentDirectory, "../dist/index.js"),
        path.resolve(currentDirectory, "../src/index.ts"),
        path.resolve(currentDirectory, "../src/plugin-entry.ts"),
        path.resolve(currentDirectory, "../src/index.js")
    ];

    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("expands single-line if statements by default", async () => {
    const source = "if (global.debug) { exit; }";

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        ["if (global.debug) {", "    exit;", "}", ""].join("\n")
    );
});

test("preserves compact return guards inside functions when disabled", async () => {
    const source = [
        "function guard_example() {",
        "    if (global.debug) return;",
        "    return 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function guard_example",
            "function guard_example() {",
            "    if (global.debug) { return; }",
            "    return 1;",
            "}",
            ""
        ].join("\n")
    );
});

test("expands guarded returns with values when single-line is disabled", async () => {
    const source = [
        "function guard_with_value() {",
        "    if (should_stop()) return false;",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        allowSingleLineIfStatements: false
    });

    assert.strictEqual(
        formatted,
        [
            "",
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
