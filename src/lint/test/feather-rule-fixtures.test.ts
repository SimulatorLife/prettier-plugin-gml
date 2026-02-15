import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { lintWithFeatherRule as runFeatherRule } from "./rule-test-harness.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures", "feather"),
    path.resolve(testDirectory, "../../test/fixtures/feather")
];

function lintWithFeatherRule(
    ruleName: string,
    code: string
): { messages: Array<{ messageId: string }>; output: string } {
    return runFeatherRule(LintWorkspace.Lint.plugin, ruleName, code);
}

async function readFixture(ruleName: string, fileName: "input.gml" | "fixed.gml"): Promise<string> {
    for (const candidate of fixtureRootCandidates) {
        const fixturePath = path.join(candidate, ruleName, fileName);
        try {
            return await readFile(fixturePath, "utf8");
        } catch {
            continue;
        }
    }

    throw new Error(`Unable to resolve fixture path for ${ruleName}/${fileName}`);
}

void test("feather migrated fixture rules apply local fixes", async () => {
    const fixtureRules = [
        "gm1003",
        "gm1004",
        "gm1005",
        "gm1012",
        "gm1014",
        "gm1016",
        "gm1017",
        "gm1021",
        "gm1023",
        "gm1054",
        "gm1100",
        "gm2023",
        "gm2025",
        "gm2040",
        "gm2064"
    ] as const;
    const cases = await Promise.all(
        fixtureRules.map(async (ruleName) => {
            const [input, expected] = await Promise.all([
                readFixture(ruleName, "input.gml"),
                readFixture(ruleName, "fixed.gml")
            ]);
            return { ruleName, input, expected };
        })
    );

    for (const entry of cases) {
        const result = lintWithFeatherRule(entry.ruleName, entry.input);
        assert.equal(result.messages.length > 0, true, `${entry.ruleName} should report diagnostics`);
        assert.equal(result.output, entry.expected, `${entry.ruleName} should apply the expected fixer`);
    }
});
