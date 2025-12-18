import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

void test("condenses boolean branches with unreachable statements", async () => {
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

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function condense_with_unreachable",
            "/// @param condition",
            "function condense_with_unreachable(condition) {",
            "    return condition;",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves guard extraction descriptions when condensing", async () => {
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

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    assert.ok(
        formatted.includes(
            "/// @description Guard extraction: (foo and qux) or (bar and qux)."
        ),
        "Expected guard extraction description to remain unchanged."
    );

    assert.ok(
        !formatted.includes(" == "),
        "Expected guard extraction description to omit simplified equality."
    );
});

void test("preserves branching return descriptions without equivalence suffixes", async () => {
    const source = [
        "/// @function condense_implication",
        "/// @description Implication: if (foo) return bar; else return true.",
        "function condense_implication(foo, bar) {",
        "    if (foo) {",
        "        return bar;",
        "    }",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function condense_implication",
            "/// @param foo",
            "/// @param bar",
            "/// @description Implication: if (foo) return bar; else return true.",
            "function condense_implication(foo, bar) {",
            "    return !foo or bar;",
            "}",
            ""
        ].join("\n"),
        "Expected doc description to remain unchanged when condensing branching returns."
    );
});

void test("retains original multi-branch descriptions when condensing", async () => {
    const source = [
        "/// @function condense_multi_branch",
        "/// @param {bool} foo",
        "/// @param {bool} bar",
        "/// @param {bool} baz",
        "/// @description Original multi-branch: if (foo and bar or baz) return (foo and bar); else return (foo or baz).",
        "function condense_multi_branch(foo, bar, baz) {",
        "    if ((foo and bar) or baz) {",
        "        return foo and bar;",
        "    }",
        "    return foo or baz;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    const lines = formatted.split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.notStrictEqual(
        descriptionIndex,
        -1,
        "Expected a description doc comment line to remain after condensing."
    );

    assert.strictEqual(
        lines[descriptionIndex],
        "/// @description Original multi-branch: if (foo and bar or baz) return (foo and bar); else return",
        "Expected the @description line to include the simplified expression summary."
    );
    assert.strictEqual(
        lines[descriptionIndex + 1],
        "///              (foo or baz).",
        "Expected the wrapped continuation line to retain the original clause."
    );
});

void test("preserves distinct functions that condense to the same expression", async () => {
    const source = [
        "function first(condition) {",
        "    if (condition) {",
        "        return true;",
        "    }",
        "    return false;",
        "}",
        "function second(condition) {",
        "    if (condition) {",
        "        return true;",
        "    }",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    assert.match(
        formatted,
        /function first\(condition\) {\s+return condition;\s+}/,
        "Expected the first condensed function to remain in the output."
    );

    assert.match(
        formatted,
        /function second\(condition\) {\s+return condition;\s+}/,
        "Expected the second condensed function to remain in the output."
    );
});

void test("prioritizes negated guard when condensing guard fallbacks", async () => {
    const source = [
        "function guard_with_fallback(foo, bar, baz) {",
        "    if ((foo && bar) || baz) {",
        "        return foo && bar;",
        "    }",
        "",
        "    return foo || baz;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        condenseLogicalExpressions: true
    });

    assert.ok(
        formatted.includes("return foo and (!baz or bar);"),
        "Expected condensed expression to place the negated guard before the positive operand."
    );
});
