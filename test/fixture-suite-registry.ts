import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type FixtureAdapter, FixtureRunner } from "@gmloop/fixture-runner";
import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { Refactor } from "@gmloop/refactor";
import { ESLint } from "eslint";

import { resolveFixtureLintRecoveryMode } from "../src/lint/test/rules/recovery-mode.js";
import { createIntegrationFixtureSuiteDefinition } from "./integration-fixture-suite-definition.js";

export interface FixtureSuiteRegistration {
    workspaceName: string;
    suiteName: string;
    compiledWorkspaceTestFilePath: string;
    fixtureRoot: string;
    adapter: FixtureAdapter;
}

type LintRuleEntries = ReturnType<typeof Lint.services.projectConfig.createLintRuleEntriesFromProjectConfig>;
type RefactorFixtureSymbolOccurrence = {
    path: string;
    start: number;
    end: number;
    kind: "definition" | "reference";
};
type RefactorFixtureNamingTarget = {
    name: string;
    category: "function";
    path: string;
    scopeId: string | null;
    symbolId: string;
    occurrences: Array<RefactorFixtureSymbolOccurrence>;
};

type RefactorFixtureSemanticAnalyzer = {
    listNamingConventionTargets(filePaths?: Array<string>): Array<RefactorFixtureNamingTarget>;
    getSymbolOccurrences(symbolName: string): Array<RefactorFixtureSymbolOccurrence>;
};

function resolveFixtureRoot(
    moduleUrl: string,
    sourceRelativeSegments: Array<string>,
    distRelativeSegments: Array<string>
): string {
    return FixtureRunner.resolveFixtureDirectoryFromModuleUrl({
        moduleUrl,
        sourceRelativeSegments,
        distRelativeSegments
    });
}

function createFormatFixtureSuiteRegistration(): FixtureSuiteRegistration {
    const adapter: FixtureAdapter = Object.freeze({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        supports(kind: string) {
            return kind === "format";
        },
        async run({ config, inputText, runProfiledStage }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const formatted = await runProfiledStage("format", async () =>
                Format.format(inputText ?? "", formatOptions)
            );

            return {
                resultKind: "text" as const,
                outputText: formatted,
                changed: formatted !== (inputText ?? "")
            };
        }
    });

    return Object.freeze({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        compiledWorkspaceTestFilePath: "src/format/dist/test/formatter-fixtures.test.js",
        fixtureRoot: resolveFixtureRoot(
            import.meta.url,
            ["..", "src", "format", "test", "fixtures"],
            ["..", "..", "src", "format", "test", "fixtures"]
        ),
        adapter
    });
}

function createLintRuleEntriesCacheKey(ruleEntries: LintRuleEntries): string {
    const sortedRuleIds = Object.keys(ruleEntries).sort((left, right) => left.localeCompare(right));
    const serializedEntries = sortedRuleIds.map((ruleId) => [ruleId, ruleEntries[ruleId]]);
    return JSON.stringify(serializedEntries);
}

function createSingleRuleFixtureConfig(config: Record<string, unknown>): LintRuleEntries {
    const ruleEntries = Lint.services.projectConfig.createLintRuleEntriesFromProjectConfig(config);
    const enabledRuleIds = Object.keys(ruleEntries);
    if (enabledRuleIds.length !== 1) {
        throw new Error(`Lint fixture config must enable exactly one rule, received ${enabledRuleIds.length}.`);
    }

    return ruleEntries;
}

function createLintFixtureSuiteRegistration(): FixtureSuiteRegistration {
    const eslintByRuleConfigKey = new Map<string, ESLint>();
    const lintAdapter: FixtureAdapter = Object.freeze({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        supports(kind: string) {
            return kind === "lint";
        },
        async run({ fixtureCase, config, inputText, runProfiledStage }) {
            const ruleEntries = createSingleRuleFixtureConfig(config);
            const cacheKey = createLintRuleEntriesCacheKey(ruleEntries);
            const cachedEslint = eslintByRuleConfigKey.get(cacheKey);
            const eslint =
                cachedEslint ??
                new ESLint({
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
                            languageOptions: {
                                recovery: resolveFixtureLintRecoveryMode(ruleEntries)
                            },
                            rules: ruleEntries
                        }
                    ]
                });

            if (!cachedEslint) {
                eslintByRuleConfigKey.set(cacheKey, eslint);
            }

            const [result] = await runProfiledStage("lint", async () =>
                eslint.lintText(inputText ?? "", {
                    filePath: `${fixtureCase.caseId}.gml`
                })
            );
            const lintedOutput = result.output ?? inputText ?? "";

            return {
                resultKind: "text" as const,
                outputText: lintedOutput,
                changed: lintedOutput !== (inputText ?? "")
            };
        }
    });

    return Object.freeze({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        compiledWorkspaceTestFilePath: "src/lint/dist/test/rules/rule-fixtures.test.js",
        fixtureRoot: resolveFixtureRoot(
            import.meta.url,
            ["..", "src", "lint", "test", "fixtures"],
            ["..", "..", "src", "lint", "test", "fixtures"]
        ),
        adapter: lintAdapter
    });
}

function escapeRegularExpression(source: string): string {
    return source.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function collectFunctionDeclarations(sourceText: string): Array<{ name: string; start: number }> {
    const declarations: Array<{ name: string; start: number }> = [];
    const declarationPattern = /function\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let match: RegExpExecArray | null = declarationPattern.exec(sourceText);

    while (match !== null) {
        const functionName = match.groups?.name ?? "";
        const functionNameStart = (match.index ?? 0) + match[0].indexOf(functionName);
        declarations.push({
            name: functionName,
            start: functionNameStart
        });

        match = declarationPattern.exec(sourceText);
    }

    return declarations;
}

function collectNameOccurrences(sourceText: string, name: string): Array<{ start: number; end: number }> {
    const escapedName = escapeRegularExpression(name);
    const pattern = new RegExp(`(?<=^|[^A-Za-z0-9_])${escapedName}(?=[^A-Za-z0-9_]|$)`, "g");
    const hits: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null = pattern.exec(sourceText);

    while (match !== null) {
        const start = match.index ?? 0;
        hits.push({
            start,
            end: start + name.length
        });

        match = pattern.exec(sourceText);
    }

    return hits;
}

async function createFixtureSemanticAnalyzer(projectRoot: string, gmlFilePaths: ReadonlyArray<string>) {
    const sourceByPath = new Map<string, string>();
    const declarationIndex = new Map<string, { path: string; start: number }>();

    await Promise.all(
        gmlFilePaths.map(async (relativePath) => {
            const absolutePath = path.join(projectRoot, relativePath);
            const sourceText = await readFile(absolutePath, "utf8");
            sourceByPath.set(relativePath, sourceText);

            for (const declaration of collectFunctionDeclarations(sourceText)) {
                declarationIndex.set(declaration.name, {
                    path: relativePath,
                    start: declaration.start
                });
            }
        })
    );

    const occurrencesByName = new Map<string, Array<RefactorFixtureSymbolOccurrence>>();
    for (const functionName of declarationIndex.keys()) {
        const occurrences: Array<RefactorFixtureSymbolOccurrence> = [];
        for (const [relativePath, sourceText] of sourceByPath.entries()) {
            for (const hit of collectNameOccurrences(sourceText, functionName)) {
                const declaration = declarationIndex.get(functionName) ?? null;
                const isDefinition =
                    declaration !== null && declaration.path === relativePath && declaration.start === hit.start;

                occurrences.push({
                    path: relativePath,
                    start: hit.start,
                    end: hit.end,
                    kind: isDefinition ? "definition" : "reference"
                });
            }
        }

        occurrencesByName.set(functionName, occurrences);
    }

    const namingTargets: Array<RefactorFixtureNamingTarget> = [...declarationIndex.entries()].map(
        ([name, declaration]) => ({
            name,
            category: "function",
            path: declaration.path,
            scopeId: null,
            symbolId: `gml/script/${name}`,
            occurrences: []
        })
    );

    return {
        listNamingConventionTargets(filePaths?: Array<string>) {
            if (!Array.isArray(filePaths) || filePaths.length === 0) {
                return namingTargets;
            }

            const selectedPaths = new Set(filePaths.map((entry) => path.resolve(projectRoot, entry)));
            return namingTargets.filter((target) => selectedPaths.has(path.resolve(projectRoot, target.path)));
        },
        getSymbolOccurrences(symbolName: string) {
            return occurrencesByName.get(symbolName) ?? [];
        }
    } satisfies RefactorFixtureSemanticAnalyzer;
}

async function collectProjectGmlFiles(projectRoot: string): Promise<Array<string>> {
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

function createRefactorFixtureSuiteRegistration(): FixtureSuiteRegistration {
    const adapter: FixtureAdapter = Object.freeze({
        workspaceName: "refactor",
        suiteName: "refactor fixtures",
        supports(kind: string) {
            return kind === "refactor";
        },
        async run({ config, workingProjectDirectoryPath, runProfiledStage }) {
            const normalizedConfig = Refactor.normalizeRefactorProjectConfig(config.refactor);
            const projectRoot = workingProjectDirectoryPath ?? "";
            const gmlFilePaths = await collectProjectGmlFiles(projectRoot);
            const semantic = await createFixtureSemanticAnalyzer(projectRoot, gmlFilePaths);
            const engine = new Refactor.RefactorEngine({ semantic });

            await runProfiledStage("refactor", async () => {
                await engine.executeConfiguredCodemods({
                    projectRoot,
                    targetPaths: [projectRoot],
                    gmlFilePaths,
                    config: normalizedConfig,
                    readFile: async (filePath) =>
                        readFile(path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath), "utf8"),
                    writeFile: async (filePath, content) =>
                        writeFile(
                            path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath),
                            content,
                            "utf8"
                        ),
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

    return Object.freeze({
        workspaceName: "refactor",
        suiteName: "refactor fixtures",
        compiledWorkspaceTestFilePath: "src/refactor/dist/test/refactor-fixtures.test.js",
        fixtureRoot: resolveFixtureRoot(
            import.meta.url,
            ["..", "src", "refactor", "test", "fixtures"],
            ["..", "..", "src", "refactor", "test", "fixtures"]
        ),
        adapter
    });
}

/**
 * Create the canonical fixture suite registry shared by workspace, aggregate,
 * and profiling fixture runs.
 *
 * @returns Ordered fixture suite registrations for all fixture-owning areas.
 */
export function createFixtureSuiteRegistry(): ReadonlyArray<FixtureSuiteRegistration> {
    return Object.freeze([
        createFormatFixtureSuiteRegistration(),
        createLintFixtureSuiteRegistration(),
        createRefactorFixtureSuiteRegistration(),
        createIntegrationFixtureSuiteDefinition()
    ]);
}
