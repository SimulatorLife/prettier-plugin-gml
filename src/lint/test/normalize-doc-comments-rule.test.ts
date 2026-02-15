import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

type FixOperation = { kind: "replace"; range: [number, number]; text: string };

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
        cursor = end;
    }

    output += text.slice(cursor);
    return output;
}

function runNormalizeDocCommentsRule(code: string): string {
    const rule = LintWorkspace.Lint.plugin.rules["normalize-doc-comments"];
    const fixes: Array<FixOperation> = [];
    const lineStarts = buildLineStarts(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex: (index: number) => getLocFromIndex(lineStarts, index)
        },
        report(payload: {
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): FixOperation;
            }) => FixOperation | null;
        }) {
            if (!payload.fix) {
                return;
            }

            const fixer = {
                replaceTextRange(range: [number, number], text: string): FixOperation {
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

    return applyFixes(code, fixes);
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
