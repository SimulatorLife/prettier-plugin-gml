import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("preserves triple-slash continuation lines adjacent to doc tags", async () => {
    const source = [
        "/// @description Base doc line.",
        "///              Continuation text is intentionally aligned.",
        "function demo() {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        [
            "/// @description Base doc line.",
            "///              Continuation text is intentionally aligned.",
            "function demo() {}",
            ""
        ].join("\n")
    );
});

void test("normalizes method-list triple-slash lines into plain line comments", async () => {
    const source = [
        "// Feather disable all",
        "/// .__Destroy()",
        "///",
        "/// .__GetBuffer()",
        "function __Batch() constructor {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        [
            "// Feather disable all",
            "// .__Destroy()",
            "// .__GetBuffer()",
            "",
            "function __Batch() constructor {}",
            ""
        ].join("\n")
    );
});

void test("does not insert empty doc separator between description and continuation", async () => {
    const source = [
        "/// @description Write a unit triangular prism.",
        "/// Local space: X in [-0.5,+0.5], Y in [-0.5,+0.5].",
        "function prism() {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        [
            "/// @description Write a unit triangular prism.",
            "///              Local space: X in [-0.5,+0.5], Y in [-0.5,+0.5].",
            "function prism() {}",
            ""
        ].join("\n")
    );
});

void test("keeps indented non-decorative block comments attached to function bodies", async () => {
    const source = [
        "function demo() {",
        "    /*",
        "\t\tExample block comment",
        "    */",
        "    return 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        ["function demo() {", "    /*", "        Example block comment", "    */", "    return 1;", "}", ""].join("\n")
    );
});

void test("collapses decorative slash banners into attached block comments without extra indentation", async () => {
    const source = [
        "function demo() {",
        "    /*",
        "        Block docs",
        "    */",
        "\t/*////////////////////////////////////////////////////",
        "\t        Return an array",
        "\t*/////////////////////////////////////////////////////",
        "\treturn [1, 2, 3];",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        [
            "function demo() {",
            "    /*",
            "        Block docs",
            "    */",
            "    /* Return an array */",
            "    return [1, 2, 3];",
            "}",
            ""
        ].join("\n")
    );
});
