import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function runNormalizeDocCommentsRule(code: string): string {
    const rule = LintWorkspace.Lint.plugin.rules["normalize-doc-comments"];
    const fixes: Array<ReplaceTextRangeFixOperation> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            if (!payload.fix) {
                return;
            }

            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };

            const fix = payload.fix(fixer);
            if (fix) {
                fixes.push(fix);
            }
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    return applyFixOperations(code, fixes);
}

void test("normalize-doc-comments promotes leading summary lines into @description", () => {
    const input = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}"
    ].join("\n");

    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /\/\/\/ @description Leading summary/);
    assert.match(output, /\/\/\/\s+Additional note/);
    assert.match(output, /\/\/\/ @param value - the input/);
});

void test("normalize-doc-comments removes empty @description lines", () => {
    const input = ["/// @description", "function test() {}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.doesNotMatch(output, /@description\s*$/m);
});

void test("normalize-doc-comments preserves non-empty @description content", () => {
    const input = ["/// @description Initialize the sky background", "var a = 1;"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /@description Initialize the sky background/);
});

void test("normalize-doc-comments canonicalizes legacy // @tag comments", () => {
    const input = ["// @description legacy style", "function demo() {}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /^\/\/\/ @description legacy style/m);
});

void test("normalize-doc-comments synthesizes missing doc tags for undocumented functions", () => {
    const input = ["function synth_me(_a, b = 1) {", "    return _a + b;", "}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.doesNotMatch(output, /^\/\/\/ @description synth_me/m);
    assert.match(output, /^\/\/\/ @param a/m);
    assert.match(output, /^\/\/\/ @param b/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments appends missing @param and @returns tags to existing doc blocks", () => {
    const input = [
        "/// @description Existing docs",
        "/// @param alpha",
        "function enrich_me(alpha, beta) {",
        "    return alpha + beta;",
        "}"
    ].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.match(output, /^\/\/\/ @description Existing docs/m);
    assert.match(output, /^\/\/\/ @param alpha/m);
    assert.match(output, /^\/\/\/ @param beta/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments treats @arg and @argument as documented parameters", () => {
    const input = [
        "/// @arg alpha",
        "/// @argument beta",
        "function enrich_me(alpha, beta) {",
        "    return alpha + beta;",
        "}"
    ].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.match(output, /^\/\/\/ @param alpha$/m);
    assert.match(output, /^\/\/\/ @param beta$/m);
    assert.doesNotMatch(output, /^\/\/\/ @arg alpha$/m);
    assert.doesNotMatch(output, /^\/\/\/ @argument beta$/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments treats @return as an existing returns tag", () => {
    const input = ["/// @return {real}", "function enrich_me(alpha) {", "    return alpha;", "}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.match(output, /^\/\/\/ @returns \{real\}$/m);
    assert.doesNotMatch(output, /^\/\/\/ @return \{real\}$/m);
    assert.doesNotMatch(output, /^\/\/\/ @returns \{undefined\}$/m);
});

void test("normalize-doc-comments synthesizes tags for function assignments", () => {
    const input = [
        "var build_struct = function (_value, amount = 1) {",
        "    return { value: _value, amount: amount };",
        "};"
    ].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.doesNotMatch(output, /^\/\/\/ @description build_struct/m);
    assert.match(output, /^\/\/\/ @param value/m);
    assert.match(output, /^\/\/\/ @param amount/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments synthesizes tags when braces are on the next line", () => {
    const input = ["function split_header(arg_one, _arg_two)", "{", "    return arg_one + _arg_two;", "}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.doesNotMatch(output, /^\/\/\/ @description split_header/m);
    assert.match(output, /^\/\/\/ @param arg_one/m);
    assert.match(output, /^\/\/\/ @param arg_two/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments synthesizes tags for static function variable declarations", () => {
    const input = ["static spawn_enemy = function (_x, y = 0) {", "    return _x + y;", "};"].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.doesNotMatch(output, /^\/\/\/ @description spawn_enemy/m);
    assert.match(output, /^\/\/\/ @param x/m);
    assert.match(output, /^\/\/\/ @param y/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments preserves multiline @description continuations while synthesizing missing tags", () => {
    const input = [
        "/// @description Build a spawn packet",
        "/// with a deterministic seed",
        "function build_packet(seed) {",
        "    return seed;",
        "}"
    ].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.match(output, /^\/\/\/ @description Build a spawn packet/m);
    assert.match(output, /^\/\/\/\s+with a deterministic seed/m);
    assert.match(output, /^\/\/\/ @param seed/m);
    assert.match(output, /^\/\/\/ @returns \{undefined\}/m);
});

void test("normalize-doc-comments does not convert // // section comments into synthetic docs", () => {
    const input = [
        "// //A couple additional examples for optional gamepad types (see __input_define_gamepad_types)",
        "//",
        "// //Nintendo 64",
        "// input_icons(INPUT_GAMEPAD_TYPE_N64)",
        '// .add("gamepad face south",         "A")',
        '// .add("gamepad face east",          "B")',
        "",
        '// .add("gamepad thumbstick r down",  "C down")',
        "//",
        "// //Sega Saturn",
        "// input_icons(INPUT_GAMEPAD_TYPE_SATURN)",
        '// .add("gamepad face south", "A")',
        '// .add("gamepad face east",  "B")'
    ].join("\n");

    const output = runNormalizeDocCommentsRule(input);
    assert.equal(output, input);
});

void test("normalize-doc-comments preserves function indentation for synthesized docs", () => {
    const input = ["if (enabled) {", "    function inner(_value) {", "        return _value;", "    }", "}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);

    assert.match(output, /^ {4}\/\/\/ @param value$/m);
    assert.match(output, /^ {4}\/\/\/ @returns \{undefined\}$/m);
});
