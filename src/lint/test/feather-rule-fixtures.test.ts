import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures", "feather"),
    path.resolve(testDirectory, "../../test/fixtures/feather")
];

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

function lintWithFeatherRule(ruleName: string, code: string): { messages: Array<{ messageId: string }>; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules[ruleName];
    const messages: Array<{ messageId: string; fix?: FixOperation }> = [];
    const lineStarts = buildLineStarts(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex: (index: number) => getLocFromIndex(lineStarts, index)
        },
        report(payload: {
            messageId: string;
            fix?: (fixer: { replaceTextRange(range: [number, number], text: string): FixOperation }) => FixOperation | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): FixOperation {
                    return { kind: "replace", range, text };
                }
            };
            messages.push({
                messageId: payload.messageId,
                fix: payload.fix ? payload.fix(fixer) ?? undefined : undefined
            });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    const output = applyFixes(
        code,
        messages
            .map((message) => message.fix)
            .filter((fix): fix is FixOperation => fix !== undefined)
    );

    return {
        messages: messages.map((message) => ({ messageId: message.messageId })),
        output
    };
}

async function readFixture(ruleName: string, fileName: "input.gml" | "fixed.gml"): Promise<string> {
    for (const candidate of fixtureRootCandidates) {
        const fixturePath = path.join(candidate, ruleName, fileName);
        try {
            return await readFile(fixturePath, "utf8");
        } catch {
            continue;
        }
    }

    throw new Error(`Unable to resolve fixture path for ${ruleName}/${fileName}`);
}

void test("feather migrated fixture rules apply local fixes", async () => {
    const fixtureRules = ["gm1003", "gm1004", "gm1005", "gm1014", "gm1016", "gm1023"] as const;
    const cases = await Promise.all(
        fixtureRules.map(async (ruleName) => {
            const [input, expected] = await Promise.all([
                readFixture(ruleName, "input.gml"),
                readFixture(ruleName, "fixed.gml")
            ]);
            return { ruleName, input, expected };
        })
    );

    for (const entry of cases) {
        const result = lintWithFeatherRule(entry.ruleName, entry.input);
        assert.equal(result.messages.length > 0, true, `${entry.ruleName} should report diagnostics`);
        assert.equal(result.output, entry.expected, `${entry.ruleName} should apply the expected fixer`);
    }
});
