import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

const { Lint } = LintWorkspace;

void describe("define directive normalization", () => {
    void it("normalizes #define to #macro with single space separator", () => {
        const input = "#define  LEGACY_MACRO 123456789\n";
        const expected = "#macro LEGACY_MACRO 123456789\n";

        const rule = Lint.plugin.rules["normalize-directives"];
        const messages: Array<{ messageId: string; fix?: Array<{ kind: string; range: [number, number]; text: string }> }> = [];

        const context = {
            options: [{}],
            settings: { gml: { project: { getContext: () => null } } },
            sourceCode: { text: input },
            report: (descriptor: { messageId: string; fix?: (fixer: any) => any }) => {
                const fixer = {
                    replaceTextRange(range: [number, number], text: string) {
                        return { kind: "replace" as const, range, text };
                    }
                };
                const fix = descriptor.fix?.(fixer);
                messages.push({ messageId: descriptor.messageId, fix: fix ? (Array.isArray(fix) ? fix : [fix]) : undefined });
            }
        };

        const visitor = rule.create(context as any);
        visitor.Program?.({ type: "Program", body: [] } as any);

        assert.strictEqual(messages.length, 1);
        assert.strictEqual(messages[0]?.messageId, "normalizeDirectives");
        assert.strictEqual(messages[0]?.fix?.[0]?.text, expected);
    });
});
