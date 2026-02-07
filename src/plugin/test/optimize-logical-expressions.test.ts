import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

async function formatWithLogicalOptimization(source: string, optimizeLogicalExpressions: boolean): Promise<string> {
    return Plugin.format(source, { optimizeLogicalExpressions });
}

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
        optimizeLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
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
        optimizeLogicalExpressions: true
    });

    assert.ok(
        formatted.includes("/// @description Guard extraction: (foo and qux) or (bar and qux)."),
        "Expected guard extraction description to remain unchanged."
    );

    assert.ok(!formatted.includes(" == "), "Expected guard extraction description to omit simplified equality.");
});

void test("preserves branching return descriptions without equivalence suffixes", async () => {
    const source = [
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
        optimizeLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @description Implication: if (foo) return bar; else return true.",
            "/// @param foo",
            "/// @param bar",
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
        optimizeLogicalExpressions: true
    });

    const lines = formatted.split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.notStrictEqual(descriptionIndex, -1, "Expected a description doc comment line to remain after condensing.");

    assert.strictEqual(
        lines[descriptionIndex].startsWith("/// @description"),
        true,
        "Expected the @description line to remain after condensing."
    );

    const descriptionLines = [];
    for (let index = descriptionIndex; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.startsWith("///")) {
            break;
        }
        if (index > descriptionIndex && /^\/\/\/\s*@/.test(line)) {
            break;
        }
        descriptionLines.push(
            line
                .replaceAll(/^\/\/\/\s*@description\s*/g, "")
                .replaceAll(/^\/\/\/\s+/g, "")
                .trim()
        );
    }

    const descriptionText = descriptionLines
        .filter((line) => line.length > 0)
        .join(" ")
        .replaceAll(/\s+/g, " ")
        .trim();

    assert.strictEqual(
        descriptionText,
        "Original multi-branch: if (foo and bar or baz) return (foo and bar); else return (foo or baz).",
        "Expected the @description text to retain the original multi-branch summary."
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
        optimizeLogicalExpressions: true
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
        optimizeLogicalExpressions: true
    });

    assert.ok(
        formatted.includes("return foo and (!baz or bar);"),
        "Expected condensed expression to place the negated guard before the positive operand."
    );
});

void test("rewrites else-exit branches into early guard clauses", async () => {
    const source = [
        "if (instance_exists(oPlayer)) {",
        "    follow_id = oPlayer.id;",
        "    follow_id.activePlayer = true;",
        "} else {",
        "    exit;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeLogicalExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "if (!instance_exists(oPlayer)) {",
            "    exit;",
            "}",
            "follow_id = oPlayer.id;",
            "follow_id.activePlayer = true;",
            ""
        ].join("\n")
    );
});

void test("eliminates redundant temp-return pairs only when optimizeLogicalExpressions is enabled", async () => {
    const source = [
        "function eliminate_temp_return(value) {",
        "    var computed = value + 1;",
        "    return computed;",
        "}",
        ""
    ].join("\n");

    const enabled = await formatWithLogicalOptimization(source, true);
    const disabled = await formatWithLogicalOptimization(source, false);

    assert.match(enabled, /return value \+ 1;/, "Expected optimization to inline the temporary return expression.");
    assert.doesNotMatch(enabled, /var computed\s*=/, "Expected temporary declaration to be removed.");

    assert.match(disabled, /var computed = value \+ 1;/, "Expected declaration to remain when optimization is off.");
    assert.match(disabled, /return computed;/, "Expected return identifier to remain when optimization is off.");
});

void test("normalizes early-exit guard clauses only when optimizeLogicalExpressions is enabled", async () => {
    const source = [
        "function normalize_guard(ready) {",
        "    if (ready) {",
        "        do_work();",
        "    } else {",
        "        return;",
        "    }",
        "}",
        ""
    ].join("\n");

    const enabled = await formatWithLogicalOptimization(source, true);
    const disabled = await formatWithLogicalOptimization(source, false);

    assert.ok(enabled.includes("if (!ready) {"), "Expected negated guard clause when optimization is enabled.");
    assert.ok(enabled.includes("return;"), "Expected early return to be preserved in guard form.");
    assert.ok(!enabled.includes("} else {"), "Expected else branch to be removed after guard normalization.");

    assert.ok(disabled.includes("if (ready) {"), "Expected original condition when optimization is disabled.");
    assert.ok(disabled.includes("} else {"), "Expected else branch to remain when optimization is disabled.");
});

void test("caches repeated condition member access only when optimizeLogicalExpressions is enabled", async () => {
    const source = [
        "function cache_member_reads(player, bonus) {",
        "    if (player.state.current.hp > 0 and player.state.current.hp < bonus) {",
        "        bonus += 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const enabled = await formatWithLogicalOptimization(source, true);
    const disabled = await formatWithLogicalOptimization(source, false);

    assert.ok(
        enabled.includes("var __gml_cached_member = player.state.current.hp;"),
        "Expected repeated member access to be cached when optimization is enabled."
    );
    assert.ok(
        enabled.includes("if (__gml_cached_member > 0 and __gml_cached_member < bonus) {"),
        "Expected cached identifier to replace repeated member access."
    );

    assert.ok(
        !disabled.includes("__gml_cached_member"),
        "Expected no member-access cache variable when optimization is disabled."
    );
    assert.ok(
        disabled.includes("if (player.state.current.hp > 0 and player.state.current.hp < bonus) {"),
        "Expected original repeated member access when optimization is disabled."
    );
});

void test("hoists invariant loop-condition member reads only when optimizeLogicalExpressions is enabled", async () => {
    const source = [
        "function hoist_loop_condition(player, total) {",
        "    while (player.state.current.hp > 0) {",
        "        total += 1;",
        "    }",
        "    return total;",
        "}",
        ""
    ].join("\n");

    const enabled = await formatWithLogicalOptimization(source, true);
    const disabled = await formatWithLogicalOptimization(source, false);

    assert.ok(
        enabled.includes("var __gml_invariant_condition = player.state.current.hp;"),
        "Expected invariant loop condition to be hoisted when optimization is enabled."
    );
    assert.ok(
        enabled.includes("while (__gml_invariant_condition > 0) {"),
        "Expected loop condition to reference the hoisted invariant value."
    );

    assert.ok(
        !disabled.includes("__gml_invariant_condition"),
        "Expected no invariant hoist variable when optimization is disabled."
    );
    assert.ok(
        disabled.includes("while (player.state.current.hp > 0) {"),
        "Expected original loop condition when optimization is disabled."
    );
});
