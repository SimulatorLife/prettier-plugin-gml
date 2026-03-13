import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";
import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { Refactor } from "@gmloop/refactor";
import { ESLint, type Linter } from "eslint";

import { createIntegrationFixtureAdapter } from "./integration-fixture-adapter.js";

async function collectGmlFiles(projectRoot: string): Promise<Array<string>> {
    const relativePaths: Array<string> = [];
    async function walk(currentPath: string): Promise<void> {
        const entries = await readdir(currentPath, { withFileTypes: true });
        await Promise.all(
            entries.map(async (entry) => {
                const entryPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    await walk(entryPath);
                    return;
                }
                if (!entry.isFile() || !entry.name.endsWith(".gml")) {
                    return;
                }
                relativePaths.push(path.relative(projectRoot, entryPath).split(path.sep).join("/"));
            })
        );
    }
    await walk(projectRoot);
    return relativePaths.sort((left, right) => left.localeCompare(right));
}

function createFormatFixtureAdapter() {
    return Object.freeze({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        supports(kind: string) {
            return kind === "format";
        },
        async run({ config, inputText, runProfiledStage }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const formatted = await runProfiledStage("format", async () =>
                Format.normalizeFormattedOutput(await Format.format(inputText ?? "", formatOptions))
            );
            return {
                resultKind: "text" as const,
                outputText: formatted,
                changed: formatted !== (inputText ?? "")
            };
        }
    });
}

function createLintFixtureAdapter() {
    function extractRuleOptions(config: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
        );
    }

    function createLintRuleConfig(config: Record<string, unknown>): Record<string, Linter.RuleEntry> {
        const normalizedRules: Record<string, Linter.RuleEntry> = { ...Lint.normalizeLintRulesConfig(config) };
        const enabledRules = Object.entries(normalizedRules)
            .filter(([, level]) => level !== "off")
            .map(([ruleId]) => ruleId);
        const ruleOptions = extractRuleOptions(config);

        if (enabledRules.length === 1 && Object.keys(ruleOptions).length > 0) {
            const targetRuleId = enabledRules[0];
            const level = normalizedRules[targetRuleId];
            normalizedRules[targetRuleId] = [level, ruleOptions] as Linter.RuleEntry;
        }

        return normalizedRules;
    }

    return Object.freeze({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        supports(kind: string) {
            return kind === "lint";
        },
        async run({ fixtureCase, config, inputText, runProfiledStage }) {
            const eslint = new ESLint({
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
                        rules: createLintRuleConfig(config)
                    }
                ]
            });
            const [result] = await runProfiledStage("lint", async () =>
                await eslint.lintText(inputText ?? "", {
                    filePath: `${fixtureCase.caseId}.gml`
                })
            );

            return {
                resultKind: "text" as const,
                outputText: result.output ?? (inputText ?? ""),
                changed: typeof result.output === "string" && result.output !== (inputText ?? "")
            };
        }
    });
}

function createRefactorFixtureAdapter() {
    return Object.freeze({
        workspaceName: "refactor",
        suiteName: "refactor fixtures",
        supports(kind: string) {
            return kind === "refactor";
        },
        async run({ config, tempProjectDirectoryPath, runProfiledStage }) {
            const normalizedConfig = Refactor.normalizeRefactorProjectConfig(config.refactor);
            const projectRoot = tempProjectDirectoryPath ?? "";
            const gmlFilePaths = await collectGmlFiles(projectRoot);
            const engine = new Refactor.RefactorEngine();

            await runProfiledStage("refactor", async () => {
                await engine.executeConfiguredCodemods({
                    projectRoot,
                    targetPaths: [projectRoot],
                    gmlFilePaths,
                    config: normalizedConfig,
                    readFile: async (filePath) =>
                        await readFile(path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath), "utf8"),
                    writeFile: async (filePath, content) =>
                        await writeFile(path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath), content, "utf8"),
                    dryRun: false
                });
            });

            return {
                resultKind: "project-tree" as const,
                outputDirectoryPath: projectRoot,
                changed: true
            };
        }
    });
}

function profilingEnabled(): boolean {
    return process.env.GMLOOP_FIXTURE_PROFILE === "1";
}

async function runProfileCollection(): Promise<void> {
    const collector = FixtureRunner.createProfileCollector();

    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "format", "test", "fixtures"),
        adapter: createFormatFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "lint", "test", "fixtures"),
        adapter: createLintFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "refactor", "test", "fixtures"),
        adapter: createRefactorFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "test", "fixtures", "integration"),
        adapter: createIntegrationFixtureAdapter(),
        profileCollector: collector
    });

    const report = collector.createReport();
    const outputPath = process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT
        ? path.resolve(process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT)
        : path.resolve(process.cwd(), "reports", "fixture-profile.json");

    await FixtureRunner.writeJsonProfileReport(report, outputPath);
    console.log(FixtureRunner.renderHumanProfileReport(report));
}

void test("fixture profile report", async () => {
    if (!profilingEnabled()) {
        return;
    }

    await runProfileCollection();
});
