import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

function readRepoFile(relativePath: string): Promise<string> {
    return readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

void test("fixture profile report uses the same workspace adapter factories as the workspace fixture suites", async () => {
    const [
        profileReportSource,
        registrySource,
        formatSuiteSource,
        formatDefinitionSource,
        formatRuntimeSource,
        lintSuiteSource,
        lintDefinitionSource,
        lintRuntimeSource,
        refactorSuiteSource,
        refactorDefinitionSource,
        refactorRuntimeSource
    ] = await Promise.all([
        readRepoFile("test/fixture-profile-report.ts"),
        readRepoFile("test/fixture-suite-registry.ts"),
        readRepoFile("src/format/test/formatter-fixtures.test.ts"),
        readRepoFile("src/format/test/fixture-suite-definition.ts"),
        readRepoFile("src/format/src/format-entry.ts"),
        readRepoFile("src/lint/test/rules/rule-fixtures.test.ts"),
        readRepoFile("src/lint/test/rules/fixture-suite-definition.ts"),
        readRepoFile("src/lint/src/index.ts"),
        readRepoFile("src/refactor/test/refactor-fixtures.test.ts"),
        readRepoFile("src/refactor/test/fixture-suite-definition.ts"),
        readRepoFile("src/refactor/src/index.ts")
    ]);

    assert.match(profileReportSource, /createFixtureSuiteRegistry\(\)/u);
    assert.match(registrySource, /@gmloop\/format/u);
    assert.match(registrySource, /@gmloop\/lint/u);
    assert.match(registrySource, /@gmloop\/refactor/u);
    assert.doesNotMatch(registrySource, /#fixture-test\/(?:format|lint|refactor)/u);

    assert.match(formatSuiteSource, /createFormatFixtureSuiteDefinition\(\)/u);
    assert.match(formatDefinitionSource, /createFormatFixtureAdapter\(\)/u);
    assert.match(lintSuiteSource, /createLintFixtureSuiteDefinition\(\)/u);
    assert.match(lintDefinitionSource, /createLintFixtureAdapter\(\)/u);
    assert.match(refactorSuiteSource, /createRefactorFixtureSuiteDefinition\(\)/u);
    assert.match(refactorDefinitionSource, /createRefactorFixtureAdapter\(\)/u);
    assert.doesNotMatch(formatRuntimeSource, /\btesting\b/u);
    assert.doesNotMatch(lintRuntimeSource, /\btesting\b/u);
    assert.doesNotMatch(refactorRuntimeSource, /\btesting\b/u);
    assert.doesNotMatch(registrySource, /@gmloop\/(?:format|lint|refactor)\/test-support/u);
});
