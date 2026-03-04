import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function runRemoveDefaultCommentsRule(code: string): { messageCount: number; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules["remove-default-comments"];
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
    listeners.Program?.({ type: "Program" } as never);

    return {
        messageCount,
        output: applyFixOperations(code, fixes)
    };
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
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
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
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
});

void test("remove-default-comments does not touch non-placeholder comments", () => {
    const input = ["// Keep this note", "value = 1;", ""].join("\n");

    const result = runRemoveDefaultCommentsRule(input);
    assert.equal(result.messageCount, 0);
    assert.equal(result.output, input);
});

void test("remove-default-comments preserves CRLF line endings when autofixing", () => {
    const input =
        "// Script assets have changed for v2.3.0 see\r\n// https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information\r\nvalue = 1;\r\n";
    const expected = "value = 1;\r\n";

    const result = runRemoveDefaultCommentsRule(input);
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
});
