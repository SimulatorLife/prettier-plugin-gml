import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

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

type FixOperation =
    | { kind: "replace"; range: [number, number]; text: string }
    | { kind: "insert-after"; range: [number, number]; text: string };

function buildLineStarts(text: string): Array<number> {
    const starts = [0];
    for (const [index, character] of Array.from(text).entries()) {
        if (character === "\n") {
            starts.push(index + 1);
        }
    }
    return starts;
}

function getLocFromIndex(lineStarts: Array<number>, index: number): { line: number; column: number } {
    let line = 0;
    for (const [candidate, lineStart] of lineStarts.entries()) {
        if (lineStart > index) {
            break;
        }

        line = candidate;
    }

    return { line: line + 1, column: index - lineStarts[line] };
}

function applyFixes(text: string, operations: Array<FixOperation>): string {
    const ordered = [...operations].sort((left, right) => left.range[0] - right.range[0]);
    let output = "";
    let cursor = 0;
    for (const operation of ordered) {
        const [start, end] = operation.range;
        output += text.slice(cursor, start);
        output += operation.text;
        cursor = operation.kind === "replace" ? end : start;
    }

    output += text.slice(cursor);
    return output;
}

function lintWithRule(ruleName: string, code: string, options?: Record<string, unknown>) {
    const rule = Lint.plugin.rules[ruleName];
    const messages: Array<{ messageId: string; fix?: Array<FixOperation> }> = [];
    const lineStarts = buildLineStarts(code);

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
            getLocFromIndex: (index: number) => getLocFromIndex(lineStarts, index)
        },
        report(payload: {
            messageId: string;
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): FixOperation;
                insertTextAfterRange(range: [number, number], text: string): FixOperation;
            }) => FixOperation | Array<FixOperation> | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): FixOperation {
                    return { kind: "replace", range, text };
                },
                insertTextAfterRange(range: [number, number], text: string): FixOperation {
                    return { kind: "insert-after", range, text };
                }
            };

            let fixes: Array<FixOperation> | undefined;
            if (payload.fix) {
                const output = payload.fix(fixer);
                fixes = output ? (Array.isArray(output) ? output : [output]) : undefined;
            }

            messages.push({ messageId: payload.messageId, fix: fixes });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    return {
        messages,
        output: applyFixes(
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
        "optimize-logical-flow",
        "no-globalvar",
        "normalize-doc-comments",
        "optimize-math-expressions",
        "require-argument-separators"
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
