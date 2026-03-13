import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const formatTestRoot = path.resolve(process.cwd(), "src", "format", "test");
const formatFixtureRoot = path.resolve(formatTestRoot, "fixtures");
const integrationFixtureRoot = path.resolve(process.cwd(), "test", "fixtures", "integration");
const REMOVED_FORMATTER_OPTION_KEYS = new Set([
    "applyFeatherFixes",
    "preserveGlobalVarStatements",
    "optimizeLoopLengthHoisting",
    "loopLengthHoistFunctionSuffixes",
    "condenseStructAssignments",
    "useStringInterpolation",
    "optimizeLogicalExpressions",
    "optimizeMathExpressions",
    "sanitizeMissingArgumentSeparators",
    "normalizeDocComments"
]);

async function collectCaseDirectories(rootPath: string): Promise<Array<string>> {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(rootPath, entry.name))
        .sort((left, right) => left.localeCompare(right));
}

void test("format fixture files are stored only inside case directories", async () => {
    const entries = await fs.readdir(formatTestRoot, { withFileTypes: true });
    const misplacedFixtures = entries
        .filter((entry) => entry.isFile() && (entry.name.endsWith(".gml") || entry.name.endsWith(".json")))
        .map((entry) => entry.name);
    assert.deepEqual(misplacedFixtures, []);
});

void test("format fixture cases use directory-per-case layout with gmloop.json", async () => {
    const caseDirectories = await collectCaseDirectories(formatFixtureRoot);
    assert.equal(caseDirectories.length > 0, true, "Expected at least one format fixture case.");

    for (const caseDirectory of caseDirectories) {
        const fileNames = new Set(await fs.readdir(caseDirectory));
        assert.equal(fileNames.has("gmloop.json"), true, `${caseDirectory} is missing gmloop.json.`);
        assert.equal(fileNames.has("input.gml"), true, `${caseDirectory} is missing input.gml.`);
        const hasExpected = fileNames.has("expected.gml");
        assert.equal(
            hasExpected || !fileNames.has("expected.gml"),
            true,
            `${caseDirectory} has an invalid expected fixture shape.`
        );
        assert.equal(fileNames.has("options.json"), false, `${caseDirectory} must not use legacy options.json.`);
    }
});

void test("integration fixtures use directory-per-case layout with gmloop.json", async () => {
    const caseDirectories = await collectCaseDirectories(integrationFixtureRoot);
    assert.equal(caseDirectories.length > 0, true, "Expected at least one integration fixture case.");

    for (const caseDirectory of caseDirectories) {
        const fileNames = new Set(await fs.readdir(caseDirectory));
        assert.equal(fileNames.has("gmloop.json"), true, `${caseDirectory} is missing gmloop.json.`);
        assert.equal(fileNames.has("input.gml"), true, `${caseDirectory} is missing input.gml.`);
        assert.equal(fileNames.has("options.json"), false, `${caseDirectory} must not use legacy options.json.`);
    }
});

void test("fixture gmloop.json files do not include removed formatter migration keys", async () => {
    const fixtureRoots = [formatFixtureRoot, integrationFixtureRoot];

    for (const fixtureRoot of fixtureRoots) {
        for (const caseDirectory of await collectCaseDirectories(fixtureRoot)) {
            const configPath = path.join(caseDirectory, "gmloop.json");
            const parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
            const removedKeys = Object.keys(parsed).filter((key) => REMOVED_FORMATTER_OPTION_KEYS.has(key));
            assert.deepEqual(removedKeys, [], `${configPath} contains removed formatter option(s): ${removedKeys.join(", ")}`);
        }
    }
});
