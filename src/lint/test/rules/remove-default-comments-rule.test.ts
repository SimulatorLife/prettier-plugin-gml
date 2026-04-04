import { test } from "node:test";

import * as LintWorkspace from "@gmloop/lint";

import { assertEquals } from "../assertions.js";
import { runGmlRule } from "./rule-test-harness.js";

function runRemoveDefaultCommentsRule(code: string): { messageCount: number; output: string } {
    return runGmlRule({
        rule: LintWorkspace.Lint.plugin.rules["remove-default-comments"],
        code,
        programNode: { type: "Program" }
    });
}

void test("remove-default-comments deletes GameMaker migration banner comments", () => {
    const input = [
        "// Script assets have changed for v2.3.0 see",
        "// https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information",
        'show_debug_message("ok");',
        ""
    ].join("\n");
    const expected = ['show_debug_message("ok");', ""].join("\n");

    const result = runRemoveDefaultCommentsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("remove-default-comments deletes IDE placeholder description comments", () => {
    const input = [
        "/// @description Insert description here",
        "// You can write your code in this editor",
        "function demo() {",
        "    return 1;",
        "}",
        ""
    ].join("\n");
    const expected = ["function demo() {", "    return 1;", "}", ""].join("\n");

    const result = runRemoveDefaultCommentsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("remove-default-comments does not touch non-placeholder comments", () => {
    const input = ["// Keep this note", "value = 1;", ""].join("\n");

    const result = runRemoveDefaultCommentsRule(input);
    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("remove-default-comments preserves CRLF line endings when autofixing", () => {
    const input =
        "// Script assets have changed for v2.3.0 see\r\n// https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information\r\nvalue = 1;\r\n";
    const expected = "value = 1;\r\n";

    const result = runRemoveDefaultCommentsRule(input);
    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});
