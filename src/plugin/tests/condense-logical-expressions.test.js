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

test("preserves branching return descriptions without equivalence suffixes", async () => {
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

    const formatted = await format(source, {
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

test("retains original multi-branch descriptions when condensing", async () => {
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

    const formatted = await format(source, {
        condenseLogicalExpressions: true
    });

    assert.match(
        formatted,
        /@description Original multi-branch: if \(foo and bar or baz\) return \(foo and bar\); else return \(foo or baz\)\./,
        "Expected multi-branch doc descriptions to remain unchanged after condensing."
    );
});
