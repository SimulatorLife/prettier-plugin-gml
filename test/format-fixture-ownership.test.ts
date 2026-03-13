import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

type FixtureRootDefinition = Readonly<{
    kind: "format" | "lint" | "refactor" | "integration";
    rootPath: string;
}>;

const fixtureRoots: ReadonlyArray<FixtureRootDefinition> = Object.freeze([
    {
        kind: "format",
        rootPath: path.resolve(process.cwd(), "src", "format", "test", "fixtures")
    },
    {
        kind: "lint",
        rootPath: path.resolve(process.cwd(), "src", "lint", "test", "fixtures")
    },
    {
        kind: "refactor",
        rootPath: path.resolve(process.cwd(), "src", "refactor", "test", "fixtures")
    },
    {
        kind: "integration",
        rootPath: path.resolve(process.cwd(), "test", "fixtures", "integration")
    }
]);

const LEGACY_FILE_PATTERNS = [/^options\.json$/u, /^fixed\.gml$/u, /^input\.fixed\.gml$/u, /^.+\.input\.gml$/u, /^.+\.output\.gml$/u];
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

async function collectFixtureCaseDirectories(rootPath: string): Promise<Array<string>> {
    const caseDirectories: Array<string> = [];

    async function walk(currentPath: string): Promise<void> {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

        if (fileNames.has("gmloop.json")) {
            caseDirectories.push(currentPath);
            return;
        }

        await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(currentPath, entry.name))));
    }

    await walk(rootPath);
    return caseDirectories.sort((left, right) => left.localeCompare(right));
}

function assertNoLegacyFiles(caseDirectory: string, fileNames: ReadonlySet<string>): void {
    const legacyFiles = [...fileNames].filter((fileName) => LEGACY_FILE_PATTERNS.some((pattern) => pattern.test(fileName)));
    assert.deepEqual(legacyFiles, [], `${caseDirectory} contains legacy fixture files: ${legacyFiles.join(", ")}`);
}

function assertRemovedFormatterKeysAreAbsent(configPath: string, parsed: Record<string, unknown>): void {
    const removedKeys = Object.keys(parsed).filter((key) => REMOVED_FORMATTER_OPTION_KEYS.has(key));
    assert.deepEqual(removedKeys, [], `${configPath} contains removed formatter option(s): ${removedKeys.join(", ")}`);
}

function assertFixtureCaseLayout(
    fixtureRoot: FixtureRootDefinition,
    caseDirectory: string,
    fileNames: ReadonlySet<string>,
    directoryNames: ReadonlySet<string>
): void {
    if (fixtureRoot.kind === "refactor") {
        assert.deepEqual([...fileNames].sort((left, right) => left.localeCompare(right)), ["gmloop.json"]);
        assert.deepEqual(
            [...directoryNames].sort((left, right) => left.localeCompare(right)),
            ["expected", "project"],
            `${caseDirectory} must contain only expected/ and project/ directories.`
        );
        return;
    }

    assert.equal(fileNames.has("gmloop.json"), true, `${caseDirectory} is missing gmloop.json.`);
    assert.equal(fileNames.has("input.gml"), true, `${caseDirectory} is missing input.gml.`);
    const unexpectedFiles = [...fileNames].filter((fileName) => fileName !== "gmloop.json" && fileName !== "input.gml" && fileName !== "expected.gml");
    assert.deepEqual(unexpectedFiles, [], `${caseDirectory} contains unexpected files: ${unexpectedFiles.join(", ")}`);
    assert.deepEqual(
        [...directoryNames],
        [],
        `${caseDirectory} must not contain subdirectories for ${fixtureRoot.kind} fixtures.`
    );
}

void test("all fixture roots use directory-per-case layout with gmloop.json and no legacy files", async () => {
    for (const fixtureRoot of fixtureRoots) {
        const caseDirectories = await collectFixtureCaseDirectories(fixtureRoot.rootPath);
        assert.equal(caseDirectories.length > 0, true, `Expected at least one ${fixtureRoot.kind} fixture case.`);

        for (const caseDirectory of caseDirectories) {
            const entries = await fs.readdir(caseDirectory, { withFileTypes: true });
            const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
            const directoryNames = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));

            assertNoLegacyFiles(caseDirectory, fileNames);
            assertFixtureCaseLayout(fixtureRoot, caseDirectory, fileNames, directoryNames);

            const configPath = path.join(caseDirectory, "gmloop.json");
            const parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
            assertRemovedFormatterKeysAreAbsent(configPath, parsed);
        }
    }
});
