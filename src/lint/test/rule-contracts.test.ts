import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

test("only gml/require-argument-separators may consume inserted separator recovery metadata", () => {
    assert.ok(Lint.ruleIds.GmlRequireArgumentSeparators, "Expected require-argument-separators rule id to exist.");

    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const rulesDirectory = path.resolve(testDirectory, "../src/rules");
    const ruleSourceFiles = readdirSync(rulesDirectory).filter((file) => file.endsWith(".ts"));

    const matchingFiles = ruleSourceFiles.filter((file) => {
        const source = readFileSync(path.join(rulesDirectory, file), "utf8");
        return source.includes("inserted-argument-separator");
    });

    assert.deepEqual(matchingFiles, []);
});
