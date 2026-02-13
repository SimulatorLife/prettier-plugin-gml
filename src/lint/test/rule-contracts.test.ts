import assert from "node:assert/strict";
import test from "node:test";

import { Lint } from "../src/index.js";
import { reportMissingProjectContextOncePerFile } from "../src/rules/project-context.js";

test("project-aware rules declare required capabilities and unsafe reason codes", () => {
    const projectAwareRuleIds = [
        "prefer-loop-length-hoist",
        "prefer-struct-literal-assignments",
        "no-globalvar",
        "prefer-string-interpolation"
    ];

    for (const ruleId of projectAwareRuleIds) {
        const rule = Lint.plugin.rules[ruleId] as unknown as { meta?: { docs?: Record<string, unknown> } };
        const docs = rule.meta?.docs;
        const gmlDocs = docs.gml as Record<string, unknown>;
        assert.equal(docs.requiresProjectContext, true, `${ruleId} should be project-aware`);
        assert.ok(Array.isArray(gmlDocs.requiredCapabilities), `${ruleId} must declare requiredCapabilities`);
        assert.ok(Array.isArray(gmlDocs.unsafeReasonCodes), `${ruleId} must declare unsafeReasonCodes`);
    }
});

test("missing project context helper reports at most once per file", () => {
    const reported: Array<string> = [];
    const context = {
        report: (payload: { messageId: string }) => {
            reported.push(payload.messageId);
        }
    } as unknown as Parameters<typeof reportMissingProjectContextOncePerFile>[0];

    const listener = reportMissingProjectContextOncePerFile(context, Object.freeze({}));
    listener.Program?.({ type: "Program" } as never);
    listener.Program?.({ type: "Program" } as never);

    assert.deepEqual(reported, ["missingProjectContext"]);
});
