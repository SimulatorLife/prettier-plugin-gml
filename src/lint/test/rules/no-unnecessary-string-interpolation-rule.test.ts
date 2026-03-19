import { test } from "node:test";

import * as LintWorkspace from "@gmloop/lint";

import { assertEquals } from "../assertions.js";
import { parseProgramNode } from "./lint-rule-test-harness.js";
import { runGmlRule } from "./rule-test-harness.js";

function runNoUnnecessaryStringInterpolationRule(code: string): { messageCount: number; output: string } {
    return runGmlRule({
        rule: LintWorkspace.Lint.plugin.rules["no-unnecessary-string-interpolation"],
        code,
        programNode: parseProgramNode(code)
    });
}

void test("no-unnecessary-string-interpolation removes unnecessary template marker", () => {
    const input = 'layer_name = $"instances";\n';
    const result = runNoUnnecessaryStringInterpolationRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, 'layer_name = "instances";\n');
});

void test("no-unnecessary-string-interpolation preserves valid interpolation", () => {
    const input = 'layer_name = $"instances are: {myInstances}";\n';
    const result = runNoUnnecessaryStringInterpolationRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});
