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

test("inserts a blank line between large variable blocks and following loops", async () => {
    const source = [
        "function demo() {",
        "    var alpha = 1;",
        "    var beta = 2;",
        "    var gamma = 3;",
        "    var delta = 4;",
        "    for (var index = 0; index < 10; index += 1) {",
        "        alpha += index;",
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines[7],
        "",
        "Expected a blank line to separate the variable declarations from the loop body."
    );
});

test("formats struct static functions without infinite recursion", async () => {
    const source = [
        "function child_struct(_foo, _value) constructor {",
        "    static remove_ellipse = function() {",
        "        for (var i = 0; i < array_length(nodes); i += 1) {",
        "            if (!collision_ellipse(0, 0, width, height, nodes[i], false, true)) {",
        "                instance_destroy(nodes[i]);",
        "            }",
        "        }",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);

    assert.equal(typeof formatted, "string");
});
