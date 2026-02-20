import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Lint } from "@gml-modules/lint";
import { Plugin } from "@gml-modules/plugin";
import { ESLint, type Linter } from "eslint";

const fileEncoding: BufferEncoding = "utf8";
const fixtureExtension = ".gml";
const DOC_COMMENT_PATTERN = /^\s*\/\/\/\s*@/i;

const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixtureDirectory = rawDirectory.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(rawDirectory, "..", "fixtures", "plugin-integration")
    : path.resolve(rawDirectory, "fixtures", "plugin-integration");

type IntegrationCase = {
    baseName: string;
    inputSource: string;
    expectedOutput: string;
    options: Record<string, unknown> | null;
    lintRules: Readonly<Record<string, Linter.RuleEntry>> | null;
    expectParseError: boolean;
};

type IntegrationCaseFiles = {
    inputFile?: string;
    outputFile?: string;
};

const allCapabilities = new Set([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION",
    "RENAME_CONFLICT_PLANNING"
]);
const allGmlRuleLevels = Object.freeze(
    Object.fromEntries(
        Object.values(Lint.ruleIds)
            .filter((ruleId) => ruleId.startsWith("gml/"))
            .map((ruleId) => [ruleId, "off" as const])
    )
);

const integrationDefaultLintRules: Readonly<Record<string, Linter.RuleEntry>> = Object.freeze({
    ...allGmlRuleLevels
});

function resolveLoopHoistIdentifierForIntegration(
    preferredName: string,
    localIdentifierNames: ReadonlySet<string>
): string | null {
    if (preferredName.length === 0) {
        return null;
    }

    if (!localIdentifierNames.has(preferredName)) {
        return preferredName;
    }

    for (let suffix = 1; suffix <= 1000; suffix += 1) {
        const candidate = `${preferredName}_${suffix}`;
        if (!localIdentifierNames.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

const integrationProjectContext = Object.freeze({
    capabilities: allCapabilities,
    isIdentifierNameOccupiedInProject: () => false,
    listIdentifierOccurrenceFiles: () => new Set<string>(),
    planFeatherRenames: (
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
    ) =>
        requests.map((request) => ({
            identifierName: request.identifierName,
            preferredReplacementName: request.preferredReplacementName,
            safe: true,
            reason: null
        })),
    resolveLoopHoistIdentifier: resolveLoopHoistIdentifierForIntegration,
    assessGlobalVarRewrite: () =>
        Object.freeze({
            allowRewrite: true,
            reason: null
        })
});

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error;
}

function removeDocCommentLines(text: string): string {
    return text
        .split(/\r?\n/)
        .filter((line) => !DOC_COMMENT_PATTERN.test(line))
        .join("\n");
}

function canonicalizeFixtureText(text: string): string {
    return removeDocCommentLines(text).trim();
}

async function readFixture(filePath: string): Promise<string> {
    const contents = await fs.readFile(filePath, fileEncoding);
    if (typeof contents !== "string") {
        throw new TypeError(`Expected fixture '${filePath}' to be read as a string.`);
    }

    return contents.trim();
}

async function tryLoadOptions(baseName: string): Promise<Record<string, unknown> | null> {
    const optionsFile = `${baseName}.options.json`;
    const optionsPath = path.join(fixtureDirectory, optionsFile);

    try {
        const contents = await fs.readFile(optionsPath, fileEncoding);
        if (!contents) {
            return null;
        }

        const parsed = JSON.parse(contents) as unknown;
        if (parsed && typeof parsed === "object") {
            return parsed as Record<string, unknown>;
        }
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }

        throw error;
    }

    return null;
}

function extractFixtureExpectations(
    options: Record<string, unknown> | null
): Readonly<{
    options: Record<string, unknown> | null;
    lintRules: Readonly<Record<string, Linter.RuleEntry>> | null;
    expectParseError: boolean;
}> {
    if (!options) {
        return Object.freeze({
            options: null,
            lintRules: null,
            expectParseError: false
        });
    }

    const { expectParseError, lintRules, ...pluginOptions } = options;
    const hasPluginOptions = Object.keys(pluginOptions).length > 0;
    const hasLintRules =
        lintRules !== null &&
        typeof lintRules === "object" &&
        !Array.isArray(lintRules) &&
        Object.keys(lintRules as Record<string, unknown>).length > 0;
    const lintRuleOverrides = hasLintRules
        ? (Object.freeze({ ...(lintRules as Record<string, Linter.RuleEntry>) }) as Readonly<
            Record<string, Linter.RuleEntry>
        >)
        : null;
    return Object.freeze({
        options: hasPluginOptions ? pluginOptions : null,
        lintRules: lintRuleOverrides,
        expectParseError: expectParseError === true
    });
}

async function loadIntegrationCases(): Promise<Array<IntegrationCase>> {
    const entries = await fs.readdir(fixtureDirectory);
    const caseMap = new Map<string, IntegrationCaseFiles>();

    for (const entry of entries) {
        if (!entry.endsWith(fixtureExtension)) {
            continue;
        }

        if (entry.endsWith(`.input${fixtureExtension}`)) {
            const baseName = entry.replace(`.input${fixtureExtension}`, "");
            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, inputFile: entry });
            continue;
        }

        if (entry.endsWith(`.output${fixtureExtension}`)) {
            const baseName = entry.replace(`.output${fixtureExtension}`, "");
            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, outputFile: entry });
        }
    }

    return Promise.all(
        [...caseMap.keys()].toSorted().map(async (baseName) => {
            const caseFiles = caseMap.get(baseName);
            if (!caseFiles) {
                throw new Error(`Fixture '${baseName}' could not be loaded from case map.`);
            }

            const { inputFile, outputFile } = caseFiles;
            if (!inputFile || !outputFile) {
                throw new Error(`Fixture '${baseName}' is missing its ${inputFile ? "output" : "input"} file.`);
            }

            const inputPath = path.join(fixtureDirectory, inputFile);
            const outputPath = path.join(fixtureDirectory, outputFile);
            const [inputSource, expectedOutput, rawOptions] = await Promise.all([
                fs.readFile(inputPath, fileEncoding),
                readFixture(outputPath),
                tryLoadOptions(baseName)
            ]);
            const fixtureExpectations = extractFixtureExpectations(rawOptions);

            return {
                baseName,
                inputSource,
                expectedOutput,
                options: fixtureExpectations.options,
                lintRules: fixtureExpectations.lintRules,
                expectParseError: fixtureExpectations.expectParseError
            };
        })
    );
}

function createIntegrationLint(ruleOverrides: Readonly<Record<string, Linter.RuleEntry>> | null): ESLint {
    const resolvedRules =
        ruleOverrides === null ? integrationDefaultLintRules : { ...integrationDefaultLintRules, ...ruleOverrides };

    return new ESLint({
        overrideConfigFile: true,
        fix: true,
        overrideConfig: [
            {
                files: ["**/*.gml"],
                plugins: {
                    gml: Lint.plugin,
                    feather: Lint.featherPlugin
                },
                language: "gml/gml",
                rules: resolvedRules,
                settings: {
                    gml: {
                        project: {
                            getContext: () => integrationProjectContext
                        }
                    }
                }
            }
        ]
    });
}

async function runIntegrationLintPass(
    sourceText: string,
    baseName: string,
    ruleOverrides: Readonly<Record<string, Linter.RuleEntry>> | null
): Promise<string> {
    const integrationLint = createIntegrationLint(ruleOverrides);
    const [result] = await integrationLint.lintText(sourceText, {
        filePath: `${baseName}.gml`
    });

    if (typeof result.output === "string") {
        return result.output;
    }

    return sourceText;
}

const integrationCases = await loadIntegrationCases();

void describe("Plugin integration fixtures", () => {
    for (const { baseName, inputSource, expectedOutput, options, lintRules, expectParseError } of integrationCases) {
        void it(`formats ${baseName}`, async () => {
            if (expectParseError) {
                await assert.rejects(
                    Plugin.format(inputSource, options ?? undefined),
                    (error: unknown) =>
                        typeof error === "object" &&
                        error !== null &&
                        Reflect.get(error, "name") === "GameMakerSyntaxError"
                );
                return;
            }

            const formatted = await Plugin.format(inputSource, options ?? undefined);
            const linted = await runIntegrationLintPass(formatted, baseName, lintRules);
            if (baseName === "testOptimizeMathExpression") {
                console.log("FORMATTED:", formatted);
                console.log("LINTED:", linted);
            }
            assert.equal(typeof formatted, "string");
            assert.notEqual(formatted.length, 0);
            assert.strictEqual(canonicalizeFixtureText(linted), canonicalizeFixtureText(expectedOutput));
        });
    }
});
