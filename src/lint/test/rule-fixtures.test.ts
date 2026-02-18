import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import {
    applyFixOperations,
    createLocResolver,
    type InsertTextAfterRangeFixOperation,
    type ReplaceTextRangeFixOperation,
    type RuleTestFixOperation
} from "./rule-test-harness.js";

const { Lint } = LintWorkspace;

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures"),
    path.resolve(testDirectory, "../../test/fixtures")
];
const fixtureRoot = fixtureRootCandidates.find((candidate) => existsSync(candidate));
if (!fixtureRoot) {
    throw new Error(`Unable to resolve lint fixture root from candidates: ${fixtureRootCandidates.join(", ")}`);
}
const allCapabilities = new Set([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION",
    "RENAME_CONFLICT_PLANNING"
]);

function parseProgramNode(code: string): Record<string, unknown> {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string; physicalPath: string; bom: boolean },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => { ok: true; ast: Record<string, unknown> } | { ok: false };
    };

    const parseResult = language.parse(
        {
            body: code,
            path: "test.gml",
            physicalPath: "test.gml",
            bom: false
        },
        {
            languageOptions: { recovery: "limited" }
        }
    );

    if (parseResult.ok) {
        return parseResult.ast;
    }

    return { type: "Program", body: [] };
}

function lintWithRule(ruleName: string, code: string, options?: Record<string, unknown>) {
    const rule = Lint.plugin.rules[ruleName];
    const messages: Array<{
        messageId: string;
        loc?: { line: number; column: number };
        fix?: Array<RuleTestFixOperation>;
    }> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [options ?? {}],
        settings: {
            gml: {
                project: {
                    getContext: () => ({ capabilities: allCapabilities })
                }
            }
        },
        sourceCode: {
            text: code,
            parserServices: {
                gml: {
                    filePath: "test.gml"
                }
            },
            getLocFromIndex
        },
        report(payload: {
            messageId: string;
            loc?: { line: number; column: number };
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation;
            }) => RuleTestFixOperation | Array<RuleTestFixOperation> | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                },
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation {
                    return { kind: "insert-after", range, text };
                }
            };

            let fixes: Array<RuleTestFixOperation> | undefined;
            if (payload.fix) {
                const output = payload.fix(fixer);
                fixes = output ? (Array.isArray(output) ? output : [output]) : undefined;
            }

            messages.push({ messageId: payload.messageId, loc: payload.loc, fix: fixes });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.(parseProgramNode(code) as never);

    return {
        messages,
        output: applyFixOperations(
            code,
            messages
                .flatMap((message) => message.fix ?? [])
                .filter((fix) => fix.kind === "replace" || fix.kind === "insert-after")
        )
    };
}

async function readFixture(...segments: Array<string>): Promise<string> {
    return readFile(path.join(fixtureRoot, ...segments), "utf8");
}

void test("rule fixtures: diagnostics and safe fixers", async () => {
    const nonFixRules = [
        "prefer-loop-length-hoist",
        "prefer-hoistable-loop-accessors"
    ] as const;

    for (const ruleName of nonFixRules) {
        const input = await readFixture(ruleName, "input.gml");
        const result = lintWithRule(ruleName, input);
        assert.equal(result.messages.length, 1, `${ruleName} should report exactly one diagnostic`);
    }

    const fixRules = [
        "prefer-repeat-loops",
        "prefer-struct-literal-assignments",
        "optimize-logical-flow",
        "no-globalvar",
        "normalize-doc-comments",
        "normalize-directives",
        "require-control-flow-braces",
        "no-assignment-in-condition",
        "prefer-is-undefined-check",
        "normalize-operator-aliases",
        "prefer-string-interpolation",
        "optimize-math-expressions",
        "require-argument-separators",
        "normalize-data-structure-accessors",
        "require-trailing-optional-defaults"
    ] as const;

    for (const ruleName of fixRules) {
        const input = await readFixture(ruleName, "input.gml");
        const expected = await readFixture(ruleName, "fixed.gml");
        const result = lintWithRule(ruleName, input, {});
        assert.equal(result.output, expected, `${ruleName} should apply the local fixer`);
    }
});

void test("prefer-struct-literal-assignments ignores non-identifier struct bases", async () => {
    const input = await readFixture("prefer-struct-literal-assignments", "non-identifier-base.gml");
    const result = lintWithRule("prefer-struct-literal-assignments", input);
    assert.equal(result.messages.length, 0);
});

void test("prefer-struct-literal-assignments reports the first matching assignment location", () => {
    const input = [
        "#macro STILE_PLATFORM_HEIGHT 120",
        "",
        "function demo() {",
        "    settings.speed = 10;",
        '    settings.mode = "arcade";',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-struct-literal-assignments", input);
    assert.equal(result.messages.length, 1);
    assert.deepEqual(result.messages[0]?.loc, { line: 4, column: 4 });
});

void test("normalize-doc-comments removes placeholder description equal to function name", () => {
    const input = [
        "/// @description __ChatterboxClassSource",
        "/// @param filename",
        "/// @param buffer",
        "/// @param compile",
        "/// @returns {undefined}",
        "function __ChatterboxClassSource(_filename, _buffer, _compile) constructor { /* ... */ }",
        ""
    ].join("\n");
    const expected = [
        "/// @param filename",
        "/// @param buffer",
        "/// @param compile",
        "/// @returns {undefined}",
        "function __ChatterboxClassSource(_filename, _buffer, _compile) constructor { /* ... */ }",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-doc-comments aligns multiline description continuations", () => {
    const input = ["/// Alpha summary", "/// Beta continuation", "function demo() {", "    return 1;", "}", ""].join(
        "\n"
    );
    const expected = [
        "/// @description Alpha summary",
        "///              Beta continuation",
        "/// @returns {undefined}",
        "function demo() {",
        "    return 1;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-doc-comments converts legacy returns description text to @returns metadata", () => {
    const input = [
        "/// Summary",
        "/// Returns: Boolean, indicating if check passed",
        "function demo() {",
        "    return true;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "/// @description Summary",
        "/// @returns {Boolean} Indicating if check passed",
        "function demo() {",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("require-argument-separators preserves separator payload comments", async () => {
    const input = await readFixture("require-argument-separators", "separator-payload.gml");
    const result = lintWithRule("require-argument-separators", input, {});
    assert.equal(result.output, "show_debug_message_ext(name, /* keep */ payload);\n");
});

void test("require-trailing-optional-defaults lifts leading argument_count ternary fallbacks into params", () => {
    const input = [
        "function greet() {",
        '    var name = argument_count > 0 ? argument[0] : "friend";',
        '    var greeting = argument_count > 1 ? argument[1] : "Hello";',
        '    return $"{greeting}, {name}";',
        "}",
        ""
    ].join("\n");
    const expected = [
        'function greet(name = "friend", greeting = "Hello") {',
        '    return $"{greeting}, {name}";',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-trailing-optional-defaults", input, {});
    assert.equal(result.output, expected);
});

void test("require-trailing-optional-defaults condenses var+if argument_count fallback and adds trailing params", () => {
    const input = [
        "function spring(a, b, dst, force) {",
        "    var push_out = true;",
        "    if (argument_count > 4) {",
        "        push_out = argument[4];",
        "    }",
        "    return push_out;",
        "}",
        "",
        "my_func4(undefined, undefined);",
        ""
    ].join("\n");
    const expected = [
        "function spring(a, b, dst, force, push_out) {",
        "    var push_out = argument_count > 4 ? argument[4] : true;",
        "    return push_out;",
        "}",
        "",
        "my_func4(undefined);",
        ""
    ].join("\n");

    const result = lintWithRule("require-trailing-optional-defaults", input, {});
    assert.equal(result.output, expected);
});

void test("reportUnsafe=false suppresses unsafe-only diagnostics", async () => {
    const input = 'message = "HP: " + string(random(99));\n';
    const result = lintWithRule("prefer-string-interpolation", input, { reportUnsafe: false });
    assert.equal(result.messages.length, 0);
});

void test("prefer-string-interpolation rewrites string literal + string(variable) chains", () => {
    const input = [
        "for (var _i = vk_f1 + 12; _i < vk_f1 + 32; _i++) {",
        '    __input_key_name_set(_i, "f" + string(_i));',
        "}",
        ""
    ].join("\n");
    const expected = [
        "for (var _i = vk_f1 + 12; _i < vk_f1 + 32; _i++) {",
        '    __input_key_name_set(_i, $"f{_i}");',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-string-interpolation", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-is-undefined-check rewrites undefined comparisons in either operand position", () => {
    const input = [
        "if (score == undefined) return;",
        "if (undefined == lives) return;",
        "if (score != undefined) return;",
        "if (undefined != lives) return;",
        ""
    ].join("\n");
    const expected = [
        "if (is_undefined(score)) return;",
        "if (is_undefined(lives)) return;",
        "if (!is_undefined(score)) return;",
        "if (!is_undefined(lives)) return;",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-is-undefined-check", input, {});
    assert.equal(result.output, expected);
});

void test("no-globalvar rewrites declared globals and preserves non-matching identifiers", async () => {
    const input = await readFixture("no-globalvar", "rewrite-scope.gml");
    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output.includes("globalvarToken"), true);
    assert.equal(result.output.includes("globalvar score"), false);
    assert.equal(result.output.includes("global.globalvarToken"), false);
});

void test("no-globalvar rewrites comma-separated declarations and identifier uses", () => {
    const input = ["globalvar score, lives;", "score = 1;", "if (lives > 0) {", "    score += lives;", "}", ""].join(
        "\n"
    );
    const expected = [
        "global.score = 1;",
        "if (global.lives > 0) {",
        "    global.score += global.lives;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output, expected);
});

void test("migrated mixed fixture: testFlow rewrite ownership moved to lint", async () => {
    const input = await readFixture("optimize-logical-flow", "testFlow.input.gml");
    const expected = await readFixture("optimize-logical-flow", "testFlow.fixed.gml");
    const result = lintWithRule("optimize-logical-flow", input, {});
    assert.equal(result.output, expected);
    assert.equal(result.messages.length, 1);
});

void test("migrated mixed fixture: testStructs rewrite ownership moved to lint", async () => {
    const input = await readFixture("prefer-struct-literal-assignments", "testStructs.input.gml");
    const expected = await readFixture("prefer-struct-literal-assignments", "testStructs.fixed.gml");
    const result = lintWithRule("prefer-struct-literal-assignments", input, {});
    assert.equal(result.output, expected);
});

void test("migrated mixed fixture: testIfBraces rewrite ownership moved to lint", async () => {
    const input = await readFixture("no-globalvar", "testIfBraces.input.gml");
    const expected = await readFixture("no-globalvar", "testIfBraces.fixed.gml");
    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output, expected);
    assert.equal(result.messages.length, 1);
});

void test("prefer-loop-length-hoist respects null suffix override by disabling hoist generation", async () => {
    const input = await readFixture("prefer-loop-length-hoist", "input.gml");
    const result = lintWithRule("prefer-loop-length-hoist", input, {
        functionSuffixes: {
            array_length: null
        }
    });
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("prefer-repeat-loops skips conversion when loop iterator is used in body", () => {
    const input = ["for (var i = 0; i < array_length(items); i++) {", "    sum += i;", "}", ""].join("\n");
    const result = lintWithRule("prefer-repeat-loops", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("full-file rewrite rules report the first changed source location", () => {
    const locationCases = [
        {
            ruleName: "normalize-doc-comments",
            input: ["var keep = 1;", "// @description convert me", "function demo() {}", ""].join("\n"),
            expectedLoc: { line: 2, column: 2 }
        },
        {
            ruleName: "normalize-directives",
            input: ["var keep = 1;", "// #region Setup", ""].join("\n"),
            expectedLoc: { line: 2, column: 0 }
        },
        {
            ruleName: "require-control-flow-braces",
            input: ["var keep = 1;", "if (ready) step();", ""].join("\n"),
            expectedLoc: { line: 2, column: 11 }
        },
        {
            ruleName: "no-assignment-in-condition",
            input: ["var keep = 1;", "if (left = right) value = 1;", ""].join("\n"),
            expectedLoc: { line: 2, column: 10 }
        },
        {
            ruleName: "normalize-operator-aliases",
            input: ["var keep = 1;", "if (not right) {", "    keep = 2;", "}", ""].join("\n"),
            expectedLoc: { line: 2, column: 4 }
        }
    ] as const;

    for (const locationCase of locationCases) {
        const result = lintWithRule(locationCase.ruleName, locationCase.input, {});
        assert.equal(result.messages.length, 1, `${locationCase.ruleName} should report exactly one diagnostic`);
        assert.deepEqual(
            result.messages[0]?.loc,
            locationCase.expectedLoc,
            `${locationCase.ruleName} should report its first changed location`
        );
    }
});

void test("prefer-hoistable-loop-accessors reports the first matching accessor location", () => {
    const input = [
        "#macro STILE_PLATFORM_HEIGHT 120",
        "",
        "function demo(items) {",
        "    var total = array_length(items);",
        "    total += array_length(items);",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-hoistable-loop-accessors", input);
    assert.equal(result.messages.length, 1);
    assert.deepEqual(result.messages[0]?.loc, { line: 4, column: 16 });
});

void test("require-control-flow-braces does not rewrite multiline condition continuations", () => {
    const input = [
        "if (p.DistanceTo(vertices[0][0].p) < self.vertLength * 1.5)",
        "|| (p.DistanceTo(vertices[1][0].p) < self.vertLength * 1.5)",
        "{",
        "    __addVert(vertices[0]);",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces wraps inline statements with nested call parentheses safely", () => {
    const input = String.raw`if (_starting_font == undefined) __scribble_error("The default font has not been set\nCheck that you've added fonts to Scribble (scribble_font_add() / scribble_font_add_from_sprite() etc.)");
`;
    const expected = [
        "if (_starting_font == undefined) {",
        String.raw`    __scribble_error("The default font has not been set\nCheck that you've added fonts to Scribble (scribble_font_add() / scribble_font_add_from_sprite() etc.)");`,
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("require-control-flow-braces rewrites legacy then inline if clauses", () => {
    const input = ["if my_var == your_var++ then their_var;", "if my_var == your_var THEN ++their_var;", ""].join("\n");
    const expected = [
        "if (my_var == your_var++) {",
        "    their_var;",
        "}",
        "if (my_var == your_var) {",
        "    ++their_var;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("require-control-flow-braces wraps repeat statements with nested index expressions safely", () => {
    const input = 'repeat(_tag_parameter_count-1) _command_string += "," + string(_tag_parameters[_j++]);\n';
    const expected = [
        "repeat (_tag_parameter_count-1) {",
        '    _command_string += "," + string(_tag_parameters[_j++]);',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("optimize-math-expressions does not rewrite decimal literals that start with zero", () => {
    const input = "__fit_scale = _lower_limit + 0.5*(_upper_limit - _lower_limit);\n";
    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("normalize-operator-aliases does not replace punctuation exclamation marks", () => {
    const input = ["#region Emergency!", "var ready_state = !ready;", ""].join("\n");
    const expected = ["#region Emergency!", "var ready_state = !ready;", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-operator-aliases replaces invalid logical keyword 'not' with '!'", () => {
    const input = ["if (not ready) {", "    value = not(extra);", "}", ""].join("\n");
    const expected = ["if (! ready) {", "    value = !(extra);", "}", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-operator-aliases does not rewrite identifier usage of 'not'", () => {
    const input = ["var not = 1;", "value = not + 2;", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces skips macro continuation blocks", () => {
    const input = [
        '#macro __SCRIBBLE_MARKDOWN_TOGGLE_BOLD  if (_new_style == "body")\\',
        "                                        {\\",
        '                                            _new_style = "bold";\\',
        "                                        }\\",
        "                                        if (_old_style != _new_style) _write_style = true;",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces does not reinterpret already braced headers with trailing comments", () => {
    const input = [
        "if (point_in_triangle(D.x, D.y, A.x, A.y, B.x, B.y, C.x, C.y)) { // stile_point_in_triangle(x3, y3, z3, x0, y0, z0, x1, y1, z1, x2, y2, z2, N)",
        '    // show_debug_message("Verts inside");',
        "    good = false;",
        "    break;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});
