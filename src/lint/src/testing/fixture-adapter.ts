import type { FixtureAdapter } from "@gmloop/fixture-runner";
import { ESLint, type Linter } from "eslint";

import { Lint } from "../index.js";

function extractFixtureRuleOptions(config: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
    );
}

function createFixtureRuleConfig(config: Record<string, unknown>): Record<string, Linter.RuleEntry> {
    const normalizedRules = Lint.normalizeLintRulesConfig(config);
    const enabledRules = Object.entries(normalizedRules).filter(([, level]) => level !== "off");

    if (enabledRules.length !== 1) {
        throw new Error(`Lint fixture config must enable exactly one rule, received ${enabledRules.length}.`);
    }

    const [ruleId, level] = enabledRules[0] ?? [];
    if (!ruleId || !level) {
        throw new Error("Lint fixture config must resolve a single enabled rule.");
    }

    const ruleOptions = extractFixtureRuleOptions(config);
    return {
        [ruleId]: Object.keys(ruleOptions).length > 0 ? ([level, ruleOptions] as Linter.RuleEntry) : level
    };
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
                        rules: createFixtureRuleConfig(config)
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

            return {
                resultKind: "text" as const,
                outputText: result.output ?? inputText ?? "",
                changed: typeof result.output === "string" && result.output !== (inputText ?? "")
            };
        }
    });
}
