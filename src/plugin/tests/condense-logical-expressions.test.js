import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("condenses boolean branches with unreachable statements", async () => {
    const source = [
        "function condense_with_unreachable(condition) {",
        "    if (condition) {",
        "        return true;",
        "        foo();",
        "    } else {",
        "        return false;",
        "        var ignored = 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        condenseLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function condense_with_unreachable",
            "/// @param condition",
            "function condense_with_unreachable(condition) {",
            "    return condition;",
            "}",
            ""
        ].join("\n")
    );
});

test("preserves guard extraction descriptions when condensing", async () => {
    const source = [
        "/// @function condense_guard",
        "/// @param {bool} foo",
        "/// @param {bool} bar",
        "/// @param {bool} qux",
        "/// @description Guard extraction: (foo and qux) or (bar and qux).",
        "/// @returns {bool}",
        "function condense_guard(foo, bar, qux) {",
        "    if ((foo and qux) or (bar and qux)) {",
        "        return true;",
        "    }",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        condenseLogicalExpressions: true
    });

    assert.match(
        formatted,
        /Guard extraction: \(foo and qux\) or \(bar and qux\)\./,
        "Expected guard extraction description to remain unchanged."
    );

    assert.ok(
        !formatted.includes(" == "),
        "Expected guard extraction description to omit simplified equality."
    );
});
