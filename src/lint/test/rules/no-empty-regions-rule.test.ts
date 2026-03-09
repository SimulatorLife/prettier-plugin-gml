import { test } from "node:test";

import { assertEquals } from "../assertions.js";
import { lintWithRule } from "./lint-rule-test-harness.js";

function runNoEmptyRegionsRule(code: string): { messageCount: number; output: string } {
    const result = lintWithRule("no-empty-regions", code);

    return {
        messageCount: result.messages.length,
        output: result.output
    };
}

void test("no-empty-regions removes empty region blocks", () => {
    const input = ["var keep = 1;", "#region Init", "#endregion", "var keep2 = 2;", ""].join("\n");
    const expected = ["var keep = 1;", "var keep2 = 2;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("no-empty-regions does not remove regions that contain executable code", () => {
    const input = ["#region Setup", "value = 42;", "#endregion", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("no-empty-regions does not remove regions that contain comments", () => {
    const input = ["#region Setup", "    // keep this note", "#endregion", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("no-empty-regions removes multiple empty regions in one file", () => {
    const input = ["#region First", "#endregion", "var keep = 1;", "#region Second", "#endregion", ""].join("\n");
    const expected = ["var keep = 1;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("no-empty-regions ignores unmatched region directives", () => {
    const input = ["#endregion", "var keep = 1;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("no-empty-regions preserves CRLF line endings when autofixing", () => {
    const input = "var keep = 1;\r\n#region Init\r\n#endregion\r\nvar keep2 = 2;\r\n";
    const expected = "var keep = 1;\r\nvar keep2 = 2;\r\n";

    const result = runNoEmptyRegionsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});
