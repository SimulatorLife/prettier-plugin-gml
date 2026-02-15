import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures", "feather"),
    path.resolve(testDirectory, "../../test/fixtures/feather")
];

function lintWithFeatherRule(
    ruleName: string,
    code: string
): { messages: Array<{ messageId: string }>; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules[ruleName];
    const messages: Array<{ messageId: string; fix?: ReplaceTextRangeFixOperation }> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            messageId: string;
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };
            messages.push({
                messageId: payload.messageId,
                fix: payload.fix ? (payload.fix(fixer) ?? undefined) : undefined
            });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    const output = applyFixOperations(
        code,
        messages.map((message) => message.fix).filter((fix): fix is ReplaceTextRangeFixOperation => fix !== undefined)
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
    const fixtureRules = [
        "gm1003",
        "gm1004",
        "gm1005",
        "gm1014",
        "gm1016",
        "gm1023"
    ] as const;
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
