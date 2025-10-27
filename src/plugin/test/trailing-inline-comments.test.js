import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });
}

test("keeps multi-sentence inline comments on the same line", async () => {
    const source = [
        "function AttackController(attack_bonus = 10) constructor {",
        "    static perform_attack = function() {",
        "        var base_atk = 1; // Local variable for base attack value. Can be passed into 'with' block as-is.",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.split("\n");
    const assignmentLine = lines.find((line) => line.includes("base_atk = 1"));

    assert.ok(
        assignmentLine?.includes(
            "// Local variable for base attack value. Can be passed into 'with' block as-is."
        ),
        "Trailing inline comments should remain intact without sentence splitting."
    );

    assert.ok(
        !formatted.includes("// Can be passed into 'with' block as-is."),
        "The inline comment should not be moved onto a new line."
    );
});

test("struct property trailing comments remain inline without blank separators", async () => {
    const source = [
        "function trailing_comment() {",
        "    var stats = {};",
        "    stats.hp = 100; // base health",
        "    stats.mp = 50;",
        "    return stats;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.ok(
        formatted.includes("hp: 100, // base health"),
        "Trailing inline comment should remain attached to the struct property."
    );
    assert.ok(
        !formatted.includes("{\n\n        hp: 100"),
        "Struct properties should not be preceded by blank lines after consolidation."
    );
});
