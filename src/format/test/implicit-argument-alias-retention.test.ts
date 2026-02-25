import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("retains numbered arguments", async () => {
    const source = [
        "/// @param first",
        "function sample() {",
        "    var first = argument0;",
        "    return argument0;",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(
        formatted,
        [
            "/// @param first",
            "function sample() {",
            "    var first = argument0;",
            "    return argument0;",
            "}",
            ""
        ].join("\n")
    );
});

// Enforces target-state §3.2: the formatter must not perform structural or
// semantic content rewrites. Removing a `var alias = argumentN` declarator
// because it appears redundant relative to a named parameter is a semantic
// simplification that belongs in `@gml-modules/lint`, not in the formatter.
void test("does not remove argument alias declarations when function has named parameters (target-state §3.2)", async () => {
    const source = [
        "/// @param {real} first",
        "function sample(first) {",
        "    var first = argument0;",
        "    return first;",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.match(
        formatted,
        /var first = argument0;/,
        "Formatter must not remove argument alias declarations — that is a lint-workspace responsibility (target-state §3.2)"
    );
});

// Enforces target-state §3.2: the formatter must not rename `argumentN`
// identifiers to their preferred parameter names. That rewrite is semantic
// and belongs in `@gml-modules/lint`, not in the formatter.
void test("does not rename argument0 to preferred parameter name in body (target-state §3.2)", async () => {
    const source = ["function greet(name) {", "    show_debug_message(argument0);", "}", ""].join("\n");

    const formatted = await Format.format(source);

    assert.match(
        formatted,
        /argument0/,
        "Formatter must not rename argument0 to preferred parameter name — that is a lint-workspace responsibility (target-state §3.2)"
    );
    assert.doesNotMatch(
        formatted,
        /show_debug_message\(name\)/,
        "Formatter must not substitute named parameter for argument0"
    );
});
