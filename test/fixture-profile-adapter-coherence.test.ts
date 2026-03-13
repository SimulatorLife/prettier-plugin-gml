import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readRepoFile(relativePath: string): Promise<string> {
    return await readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

void test("fixture profile report uses the same workspace adapter factories as the workspace fixture suites", async () => {
    const [profileReportSource, formatSuiteSource, lintSuiteSource, refactorSuiteSource] = await Promise.all([
        readRepoFile("test/fixture-profile-report.ts"),
        readRepoFile("src/format/test/formatter-fixtures.test.ts"),
        readRepoFile("src/lint/test/rules/rule-fixtures.test.ts"),
        readRepoFile("src/refactor/test/refactor-fixtures.test.ts")
    ]);

    assert.match(profileReportSource, /Format\.testing\.createFixtureAdapter\(\)/u);
    assert.match(profileReportSource, /Lint\.testing\.createFixtureAdapter\(\)/u);
    assert.match(profileReportSource, /Refactor\.testing\.createFixtureAdapter\(\)/u);
    assert.doesNotMatch(profileReportSource, /function createFormatFixtureAdapter/u);
    assert.doesNotMatch(profileReportSource, /function createLintFixtureAdapter/u);
    assert.doesNotMatch(profileReportSource, /function createRefactorFixtureAdapter/u);

    assert.match(formatSuiteSource, /Format\.testing\.createFixtureAdapter\(\)/u);
    assert.match(lintSuiteSource, /Lint\.testing\.createFixtureAdapter\(\)/u);
    assert.match(refactorSuiteSource, /Refactor\.testing\.createFixtureAdapter\(\)/u);
});
