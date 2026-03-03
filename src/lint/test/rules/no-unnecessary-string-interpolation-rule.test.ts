import assert from "node:assert/strict";
import { test } from "node:test";

import { Lint } from "@gml-modules/lint";

import {
    applyFixOperations,
    createLocResolver,
    parseProgramNode,
    type ReplaceTextRangeFixOperation
} from "./rule-test-harness.js";

function runNoUnnecessaryStringInterpolationRule(code: string): { messageCount: number; output: string } {
    const rule = Lint.plugin.rules["no-unnecessary-string-interpolation"];
    const fixes: Array<ReplaceTextRangeFixOperation> = [];
    let messageCount = 0;
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
            messageCount += 1;

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
    listeners.Program?.(parseProgramNode(code) as never);

    return {
        messageCount,
        output: applyFixOperations(code, fixes)
    };
}

void test("no-unnecessary-string-interpolation removes unnecessary template marker", () => {
    const input = 'layer_name = $"instances";\n';
    const result = runNoUnnecessaryStringInterpolationRule(input);

    assert.equal(result.messageCount, 1);
    assert.equal(result.output, 'layer_name = "instances";\n');
});

void test("no-unnecessary-string-interpolation preserves valid interpolation", () => {
    const input = 'layer_name = $"instances are: {myInstances}";\n';
    const result = runNoUnnecessaryStringInterpolationRule(input);

    assert.equal(result.messageCount, 0);
    assert.equal(result.output, input);
});
