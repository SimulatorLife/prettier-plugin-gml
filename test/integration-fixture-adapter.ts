import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { Refactor } from "@gmloop/refactor";
import { ESLint } from "eslint";

import { createLintRuleEntriesFromProjectConfig } from "#fixture-test/lint";

function hasConfiguredRefactorStage(config: Record<string, unknown>): boolean {
    return Object.hasOwn(config, "refactor") && config.refactor !== undefined;
}

function resolveIntegrationWorkspaceFilePath(tempProjectDirectoryPath: string): string {
    return path.join(tempProjectDirectoryPath, "input.gml");
}

async function runConfiguredIntegrationRefactorStage(
    config: Record<string, unknown>,
    tempProjectDirectoryPath: string
): Promise<string> {
    const projectFilePath = resolveIntegrationWorkspaceFilePath(tempProjectDirectoryPath);
    const engine = new Refactor.RefactorEngine();

    await engine.executeConfiguredCodemods({
        projectRoot: tempProjectDirectoryPath,
        targetPaths: ["input.gml"],
        gmlFilePaths: ["input.gml"],
        config: Refactor.normalizeRefactorProjectConfig(config.refactor),
        readFile: async (filePath) =>
            await readFile(path.isAbsolute(filePath) ? filePath : path.join(tempProjectDirectoryPath, filePath), "utf8"),
        writeFile: async (filePath, content) =>
            await writeFile(
                path.isAbsolute(filePath) ? filePath : path.join(tempProjectDirectoryPath, filePath),
                content,
                "utf8"
            ),
        dryRun: false
    });

    return await readFile(projectFilePath, "utf8");
}

export function createIntegrationFixtureAdapter() {
    return Object.freeze({
        workspaceName: "integration",
        suiteName: "cross-module integration fixtures",
        supports(kind: string) {
            return kind === "integration";
        },
        async run({ fixtureCase, config, inputText, runProfiledStage, tempProjectDirectoryPath }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const lintRuleEntries = createLintRuleEntriesFromProjectConfig(config);

            const refactoredText =
                hasConfiguredRefactorStage(config) && tempProjectDirectoryPath
                    ? await runProfiledStage(
                          "refactor",
                          async () => await runConfiguredIntegrationRefactorStage(config, tempProjectDirectoryPath)
                      )
                    : (inputText ?? "");

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
                        rules: lintRuleEntries
                    }
                ]
            });
            const [result] = await runProfiledStage("lint", async () =>
                await eslint.lintText(refactoredText, {
                    filePath: `${fixtureCase.caseId}.gml`
                })
            );
            const lintedOutput = result.output ?? refactoredText;
            const outputText = await runProfiledStage("format", async () => await Format.format(lintedOutput, formatOptions));

            return {
                resultKind: "text" as const,
                outputText,
                changed: outputText !== (inputText ?? "")
            };
        }
    });
}
