import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("inserts a blank line between large variable blocks and following loops", async () => {
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

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");
    const forIndex = lines.findIndex((line) => line.includes("for (var index = 0"));

    assert.equal(
        lines[forIndex - 1],
        "",
        "Expected a blank line to separate the variable declarations from the loop body"
    );
});

void test("formats struct static functions without infinite recursion", async () => {
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

    const formatted = await Plugin.format(source);

    assert.equal(typeof formatted, "string");
});
