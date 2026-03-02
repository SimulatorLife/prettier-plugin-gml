/**
 * Tests for the `gml/simplify-real-string-calls` lint rule.
 *
 * This rule enforces the formatter/linter boundary: evaluating `real("string")`
 * into a numeric literal is a semantic content rewrite that belongs in the lint
 * workspace, not in `@gml-modules/format` (target-state.md §3.2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

type ParsedAstNode = Record<string, unknown>;

function parseProgramNode(code: string): ParsedAstNode {
    const language = LintWorkspace.Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string; physicalPath: string; bom: boolean },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => { ok: true; ast: ParsedAstNode } | { ok: false };
    };

    const parseResult = language.parse(
        { body: code, path: "test.gml", physicalPath: "test.gml", bom: false },
        { languageOptions: { recovery: "limited" } }
    );

    return parseResult.ok ? parseResult.ast : { type: "Program", body: [] };
}

function walkAstNodes(root: unknown, visit: (node: ParsedAstNode) => void): void {
    if (!root || typeof root !== "object") {
        return;
    }

    const visited = new Set<unknown>();
    const stack: unknown[] = [root];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object" || visited.has(current)) {
            continue;
        }

        visited.add(current);

        if (!Array.isArray(current) && typeof (current as ParsedAstNode).type === "string") {
            visit(current as ParsedAstNode);
        }

        for (const value of Object.values(current as Record<string, unknown>)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }
}

function runSimplifyRealStringCallsRule(code: string): { messageCount: number; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules["simplify-real-string-calls"];
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
    const ast = parseProgramNode(code);

    walkAstNodes(ast, (node) => {
        if (node.type === "CallExpression") {
            listeners.CallExpression?.(node as never);
        }
    });

    return {
        messageCount,
        output: applyFixOperations(code, fixes)
    };
}

void describe("gml/simplify-real-string-calls", () => {
    void it("replaces real(string) with the numeric literal", () => {
        const input = 'var n = real("42");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var n = 42;\n");
    });

    void it("handles decimal numeric strings", () => {
        const input = 'var f = real("3.14");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var f = 3.14;\n");
    });

    void it("handles scientific notation strings", () => {
        const input = 'var e = real("1e5");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var e = 1e5;\n");
    });

    void it("handles uppercase REAL() calls (case-insensitive)", () => {
        const input = 'var n = REAL("10");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var n = 10;\n");
    });

    void it('handles verbatim string syntax real(@"42")', () => {
        const input = 'var n = real(@"42");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var n = 42;\n");
    });

    void it("preserves real() with a non-string literal argument", () => {
        const input = "var n = real(42);\n";
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 0);
        assert.strictEqual(result.output, input);
    });

    void it("preserves real() with an identifier argument", () => {
        const input = "var n = real(someVar);\n";
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 0);
        assert.strictEqual(result.output, input);
    });

    void it("preserves real() with a non-numeric string argument", () => {
        const input = 'var n = real("hello");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 0);
        assert.strictEqual(result.output, input);
    });

    void it("preserves real() with multiple arguments", () => {
        const input = 'var n = real("42", 10);\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 0);
        assert.strictEqual(result.output, input);
    });

    void it("preserves real() with zero arguments", () => {
        const input = "var n = real();\n";
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 0);
        assert.strictEqual(result.output, input);
    });

    void it("does not affect unrelated call expressions", () => {
        const input = 'var s = string(42);\nvar n = real("10");\n';
        const result = runSimplifyRealStringCallsRule(input);

        assert.strictEqual(result.messageCount, 1);
        assert.strictEqual(result.output, "var s = string(42);\nvar n = 10;\n");
    });
});
