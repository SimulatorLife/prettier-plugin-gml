import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { assertEquals } from "../assertions.js";
import { lintWithRule } from "./lint-rule-test-harness.js";
import { lintWithFeatherRule } from "./rule-test-harness.js";

const { Lint } = LintWorkspace;

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures"),
    path.resolve(testDirectory, "../../test/fixtures"),
    path.resolve(testDirectory, "../../../test/fixtures")
];
const fixtureRoot = fixtureRootCandidates.find((candidate) => existsSync(candidate));
if (!fixtureRoot) {
    throw new Error(`Unable to resolve lint fixture root from candidates: ${fixtureRootCandidates.join(", ")}`);
}

const allowedFixtureFileNames = new Set(["input.gml", "fixed.gml", "input.fixed.gml", "options.json"]);

type FixtureRuleKind = "gml" | "feather";

type FixturePair = Readonly<{
    kind: FixtureRuleKind;
    ruleName: string;
    fixtureDirectoryPath: string;
    inputFilePath: string;
    fixedFilePath: string;
    relativeInputPath: string;
    options: Record<string, unknown>;
}>;

function normalizeFixtureRelativePath(absolutePath: string): string {
    return path.relative(fixtureRoot, absolutePath).split(path.sep).join("/");
}

async function readFixtureOptions(fixtureDirectoryPath: string): Promise<Record<string, unknown>> {
    const optionsPath = path.join(fixtureDirectoryPath, "options.json");
    if (!existsSync(optionsPath)) {
        return {};
    }

    const optionsJson = await readFile(optionsPath, "utf8");
    const parsed = JSON.parse(optionsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError(`Fixture options must be an object: ${normalizeFixtureRelativePath(optionsPath)}`);
    }

    return parsed as Record<string, unknown>;
}

function resolveFixtureRuleName(
    fixtureRuleInfo: Readonly<{ kind: FixtureRuleKind; ruleName: string }>,
    rawOptions: Record<string, unknown>
): Readonly<{ ruleName: string; ruleOptions: Record<string, unknown> }> {
    const candidateRuleName = rawOptions.ruleName;
    if (candidateRuleName !== undefined && typeof candidateRuleName !== "string") {
        throw new TypeError(`Fixture option ruleName must be a string when provided.`);
    }

    const ruleName = typeof candidateRuleName === "string" ? candidateRuleName : fixtureRuleInfo.ruleName;
    if (candidateRuleName === undefined) {
        return Object.freeze({ ruleName, ruleOptions: rawOptions });
    }

    const ruleOptions = Object.fromEntries(
        Object.entries(rawOptions).filter(([optionKey]) => optionKey !== "ruleName")
    ) as Record<string, unknown>;
    return Object.freeze({ ruleName, ruleOptions });
}

async function collectFixtureDirectoriesRecursively(directoryPath: string): Promise<Array<string>> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const directories = [directoryPath];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const entryPath = path.join(directoryPath, entry.name);
        directories.push(...(await collectFixtureDirectoriesRecursively(entryPath)));
    }

    return directories;
}

function deriveFixtureRuleInfo(
    fixtureDirectoryPath: string
): Readonly<{ kind: FixtureRuleKind; ruleName: string }> | null {
    const relativeDirectoryPath = path.relative(fixtureRoot, fixtureDirectoryPath);
    if (relativeDirectoryPath.length === 0) {
        return null;
    }

    const relativeSegments = relativeDirectoryPath.split(path.sep).filter((segment) => segment.length > 0);
    const [firstSegment, secondSegment] = relativeSegments;
    if (!firstSegment) {
        return null;
    }

    if (firstSegment === "feather") {
        if (!secondSegment) {
            return null;
        }

        const featherRuleMatch = /^gm\d{4}/u.exec(secondSegment);
        if (!featherRuleMatch) {
            throw new Error(`Unable to derive feather rule name from fixture path: ${fixtureDirectoryPath}`);
        }

        return Object.freeze({ kind: "feather" as const, ruleName: featherRuleMatch[0] });
    }

    return Object.freeze({ kind: "gml" as const, ruleName: firstSegment });
}

function formatFixtureFailureContext(fixturePair: FixturePair): string {
    return [
        `fixture: ${fixturePair.relativeInputPath}`,
        `input: ${pathToFileURL(fixturePair.inputFilePath).href}`,
        `fixed: ${pathToFileURL(fixturePair.fixedFilePath).href}`
    ].join("\n");
}

async function collectFixturePairs(): Promise<Array<FixturePair>> {
    const fixtureDirectories = await collectFixtureDirectoriesRecursively(fixtureRoot);
    const validationErrors: Array<string> = [];
    const pairs: Array<FixturePair> = [];

    for (const fixtureDirectoryPath of fixtureDirectories) {
        const fixtureRuleInfo = deriveFixtureRuleInfo(fixtureDirectoryPath);
        if (!fixtureRuleInfo) {
            continue;
        }

        const entries = await readdir(fixtureDirectoryPath, { withFileTypes: true });
        const fileNames = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .toSorted();
        const hasSubdirectories = entries.some((entry) => entry.isDirectory());

        if (fileNames.length === 0) {
            if (!hasSubdirectories) {
                validationErrors.push(
                    `Fixture directory is empty: ${normalizeFixtureRelativePath(fixtureDirectoryPath)}`
                );
            }
            continue;
        }

        const invalidFileNames = fileNames.filter((fileName) => !allowedFixtureFileNames.has(fileName));
        if (invalidFileNames.length > 0) {
            validationErrors.push(
                `Fixture directory has invalid file names: ${normalizeFixtureRelativePath(fixtureDirectoryPath)} :: ${invalidFileNames.join(", ")}`
            );
            continue;
        }

        const hasInput = fileNames.includes("input.gml");
        const hasFixed = fileNames.includes("fixed.gml");
        const hasInputFixed = fileNames.includes("input.fixed.gml");

        const isInputFixedFixture = hasInputFixed && !hasInput && !hasFixed;
        const isInputFixedPairFixture = hasInput && hasFixed && !hasInputFixed;
        if (!isInputFixedFixture && !isInputFixedPairFixture) {
            validationErrors.push(
                `Fixture directory must contain only input.gml+fixed.gml or input.fixed.gml (options.json optional): ${normalizeFixtureRelativePath(fixtureDirectoryPath)}`
            );
            continue;
        }

        const rawOptions = await readFixtureOptions(fixtureDirectoryPath);
        const resolvedFixtureRule = resolveFixtureRuleName(fixtureRuleInfo, rawOptions);

        const ruleExists =
            fixtureRuleInfo.kind === "gml"
                ? Object.hasOwn(Lint.plugin.rules, resolvedFixtureRule.ruleName)
                : Object.hasOwn(Lint.featherPlugin.rules, resolvedFixtureRule.ruleName);
        if (!ruleExists) {
            validationErrors.push(
                `Fixture directory does not map to a known ${fixtureRuleInfo.kind} rule: ${normalizeFixtureRelativePath(fixtureDirectoryPath)} -> ${resolvedFixtureRule.ruleName}`
            );
            continue;
        }

        const inputFilePath = isInputFixedFixture
            ? path.join(fixtureDirectoryPath, "input.fixed.gml")
            : path.join(fixtureDirectoryPath, "input.gml");
        const fixedFilePath = isInputFixedFixture
            ? path.join(fixtureDirectoryPath, "input.fixed.gml")
            : path.join(fixtureDirectoryPath, "fixed.gml");

        pairs.push({
            kind: fixtureRuleInfo.kind,
            ruleName: resolvedFixtureRule.ruleName,
            fixtureDirectoryPath,
            inputFilePath,
            fixedFilePath,
            relativeInputPath: normalizeFixtureRelativePath(inputFilePath),
            options: resolvedFixtureRule.ruleOptions
        });
    }

    if (validationErrors.length > 0) {
        throw new Error(`Invalid lint fixture directory structure:\n${validationErrors.join("\n")}`);
    }

    return pairs.toSorted((left, right) => left.relativeInputPath.localeCompare(right.relativeInputPath));
}

const discoveredFixturePairs = await collectFixturePairs();
const discoveredGmlFixturePairs = discoveredFixturePairs.filter((fixturePair) => fixturePair.kind === "gml");
const discoveredFeatherFixturePairs = discoveredFixturePairs.filter((fixturePair) => fixturePair.kind === "feather");

void test("discovers lint fixture input/fixed pairs", () => {
    assertEquals(discoveredGmlFixturePairs.length > 0, true, "Expected at least one lint fixture input/fixed pair.");
});

void test("discovers feather fixture input/fixed pairs", () => {
    assertEquals(
        discoveredFeatherFixturePairs.length > 0,
        true,
        "Expected at least one feather fixture input/fixed pair."
    );
});

void describe("lint fixture auto-fix pairs", () => {
    for (const fixturePair of discoveredGmlFixturePairs) {
        void it(`${fixturePair.ruleName} :: ${fixturePair.relativeInputPath}`, async () => {
            const input = await readFile(fixturePair.inputFilePath, "utf8");
            const expected = await readFile(fixturePair.fixedFilePath, "utf8");
            const result = lintWithRule(fixturePair.ruleName, input, fixturePair.options);

            assertEquals(
                result.output,
                expected,
                `${fixturePair.ruleName} should produce expected output\n${formatFixtureFailureContext(fixturePair)}`
            );
        });
    }
});

void describe("feather fixture auto-fix pairs", () => {
    for (const fixturePair of discoveredFeatherFixturePairs) {
        void it(`${fixturePair.ruleName} :: ${fixturePair.relativeInputPath}`, async () => {
            const input = await readFile(fixturePair.inputFilePath, "utf8");
            const expected = await readFile(fixturePair.fixedFilePath, "utf8");
            const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, fixturePair.ruleName, input);

            assertEquals(
                result.output,
                expected,
                `${fixturePair.ruleName} should apply expected fixer\n${formatFixtureFailureContext(fixturePair)}`
            );
        });
    }
});
