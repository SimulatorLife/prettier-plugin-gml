import type { FixtureAdapter } from "@gmloop/fixture-runner";
import { ESLint } from "eslint";

import { Lint } from "../../src/index.js";

function createSingleRuleFixtureConfig(config: Record<string, unknown>) {
    const ruleEntries = Lint.createLintRuleEntriesFromProjectConfig(config);
    const enabledRuleIds = Object.keys(ruleEntries);
    if (enabledRuleIds.length !== 1) {
        throw new Error(`Lint fixture config must enable exactly one rule, received ${enabledRuleIds.length}.`);
    }

    return ruleEntries;
}

/**
 * Create the shared lint-fixture adapter used by workspace and aggregate
 * fixture suites.
 *
 * @returns Lint fixture adapter backed by the lint workspace runtime API.
 */
export function createLintFixtureAdapter(): FixtureAdapter {
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
                        languageOptions: {
                            recovery: "limited"
                        },
                        rules: createSingleRuleFixtureConfig(config)
                    }
                ]
            });
            const [result] = await runProfiledStage(
                "lint",
                async () =>
                    await eslint.lintText(inputText ?? "", {
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
}
