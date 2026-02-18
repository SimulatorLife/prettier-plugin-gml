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
    listeners.Program?.({ type: "Program" } as never);

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
        "prefer-hoistable-loop-accessors",
        "prefer-struct-literal-assignments",
        "prefer-string-interpolation"
    ] as const;

    for (const ruleName of nonFixRules) {
        const input = await readFixture(ruleName, "input.gml");
        const result = lintWithRule(ruleName, input);
        assert.equal(result.messages.length, 1, `${ruleName} should report exactly one diagnostic`);
    }

    const fixRules = [
        "prefer-repeat-loops",
        "optimize-logical-flow",
        "no-globalvar",
        "normalize-doc-comments",
        "normalize-directives",
        "require-control-flow-braces",
        "no-assignment-in-condition",
        "normalize-operator-aliases",
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

void test("require-argument-separators preserves separator payload comments", async () => {
    const input = await readFixture("require-argument-separators", "separator-payload.gml");
    const result = lintWithRule("require-argument-separators", input, {});
    assert.equal(result.output, "show_debug_message_ext(name, /* keep */ payload);\n");
});

void test("reportUnsafe=false suppresses unsafe-only diagnostics", async () => {
    const input = await readFixture("prefer-string-interpolation", "input.gml");
    const result = lintWithRule("prefer-string-interpolation", input, { reportUnsafe: false });
    assert.equal(result.messages.length, 0);
});

void test("no-globalvar rewrite scope only touches declarations", async () => {
    const input = await readFixture("no-globalvar", "rewrite-scope.gml");
    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output.includes("globalvarToken"), true);
    assert.equal(result.output.includes("global.score = undefined;"), true);
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
    const result = lintWithRule("prefer-struct-literal-assignments", input);
    assert.equal(result.messages.length, 1);
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
            input: ["var keep = 1;", "if (left AND right) {", "    keep = 2;", "}", ""].join("\n"),
            expectedLoc: { line: 2, column: 9 }
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

void test("require-control-flow-braces wraps repeat statements with nested index expressions safely", () => {
    const input =
        "repeat(_tag_parameter_count-1) _command_string += \",\" + string(_tag_parameters[_j++]);\n";
    const expected = [
        "repeat (_tag_parameter_count-1) {",
        "    _command_string += \",\" + string(_tag_parameters[_j++]);",
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
    const expected = ["#region Emergency!", "var ready_state = not ready;", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.output, expected);
});
