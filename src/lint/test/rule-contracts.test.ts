import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

type RuleMeta = Readonly<{
    docs: Readonly<Record<string, unknown>>;
    messages: Readonly<Record<string, string>>;
}>;

function getRuleMeta(ruleId: string): RuleMeta {
    const rule = LintWorkspace.Lint.plugin.rules[ruleId] as unknown as { meta: RuleMeta };
    return rule.meta;
}

function extractUnsafeFixReasonCodes(messages: Readonly<Record<string, string>>): ReadonlySet<string> {
    const reasonCodes = new Set<string>();
    for (const message of Object.values(messages)) {
        const match = /^\[unsafe-fix:(?<reasonCode>[A-Z_]+)]/.exec(message);
        if (!match?.groups?.reasonCode) {
            continue;
        }

        reasonCodes.add(match.groups.reasonCode);
    }

    return reasonCodes;
}

void test("project-aware rules declare required capabilities and unsafe reason codes", () => {
    const projectAwareRuleIds = [
        "prefer-loop-length-hoist",
        "prefer-struct-literal-assignments",
        "no-globalvar",
        "prefer-string-interpolation"
    ];

    for (const ruleId of projectAwareRuleIds) {
        const { docs, messages } = getRuleMeta(ruleId);
        const gmlDocs = docs.gml as Readonly<Record<string, unknown>>;

        assert.equal(docs.requiresProjectContext, true, `${ruleId} should be project-aware`);
        assert.ok(Array.isArray(gmlDocs.requiredCapabilities), `${ruleId} must declare requiredCapabilities`);
        assert.ok(Array.isArray(gmlDocs.unsafeReasonCodes), `${ruleId} must declare unsafeReasonCodes`);
        assert.ok(messages.missingProjectContext, `${ruleId} must declare missingProjectContext message`);

        const declaredReasonCodes = new Set(gmlDocs.unsafeReasonCodes as ReadonlyArray<string>);
        const emittedReasonCodes = extractUnsafeFixReasonCodes(messages);
        for (const reasonCode of emittedReasonCodes) {
            assert.equal(
                declaredReasonCodes.has(reasonCode),
                true,
                `${ruleId} must declare emitted unsafe-fix reason code ${reasonCode}`
            );
            assert.equal(
                [
                    "MISSING_PROJECT_CONTEXT",
                    "NAME_COLLISION",
                    "CROSS_FILE_CONFLICT",
                    "SEMANTIC_AMBIGUITY",
                    "NON_IDEMPOTENT_EXPRESSION"
                ].includes(reasonCode),
                true,
                `${ruleId} emitted unknown unsafe-fix reason code ${reasonCode}`
            );
            assert.notEqual(
                reasonCode,
                "MISSING_PROJECT_CONTEXT",
                `${ruleId} must not emit reserved reason code MISSING_PROJECT_CONTEXT via unsafeFix`
            );
        }
    }
});

void test("non-project-aware rules do not expose gml project metadata", () => {
    const nonProjectAwareRuleIds = [
        "prefer-hoistable-loop-accessors",
        "optimize-logical-flow",
        "normalize-doc-comments",
        "optimize-math-expressions",
        "require-argument-separators"
    ];

    for (const ruleId of nonProjectAwareRuleIds) {
        const { docs, messages } = getRuleMeta(ruleId);
        assert.equal(docs.requiresProjectContext, false, `${ruleId} should not require project context`);
        assert.equal("gml" in docs, false, `${ruleId} should not declare docs.gml metadata`);
        assert.equal(
            "missingProjectContext" in messages,
            false,
            `${ruleId} should not declare missingProjectContext message`
        );
    }
});

void test("project-aware rules report missingProjectContext at most once per file", () => {
    const ruleModule = LintWorkspace.Lint.plugin.rules["no-globalvar"];
    const reported: Array<string> = [];
    const listeners = ruleModule.create({
        settings: Object.freeze({}),
        sourceCode: { parserServices: { gml: { filePath: "sample.gml" } } },
        report: (payload: { messageId: string }) => {
            reported.push(payload.messageId);
        }
    } as never);

    listeners.Program?.({ type: "Program" } as never);
    listeners.Program?.({ type: "Program" } as never);

    assert.deepEqual(reported, ["missingProjectContext"]);
});
