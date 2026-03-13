import type { FixtureAdapter } from "@gmloop/fixture-runner";
import { Format } from "@gmloop/format";
import { ESLint, type Linter } from "eslint";

import { Lint } from "../../src/index.js";

function extractFixtureRuleOptionCandidates(config: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
    );
}

function resolveFixtureRuleSchemaPropertyNames(ruleId: string): ReadonlySet<string> {
    const [pluginId, ruleName] = ruleId.split("/", 2);
    const pluginRules =
        pluginId === "gml" ? (Lint.plugin.rules ?? {}) : pluginId === "feather" ? (Lint.featherPlugin.rules ?? {}) : {};
    const ruleDefinition = pluginRules[ruleName];
    const schema = ruleDefinition?.meta?.schema;
    if (!Array.isArray(schema) || schema.length === 0) {
        return new Set();
    }

    const firstSchemaEntry = schema[0];
    if (
        !firstSchemaEntry ||
        typeof firstSchemaEntry !== "object" ||
        Array.isArray(firstSchemaEntry) ||
        !("properties" in firstSchemaEntry) ||
        !firstSchemaEntry.properties ||
        typeof firstSchemaEntry.properties !== "object" ||
        Array.isArray(firstSchemaEntry.properties)
    ) {
        return new Set();
    }

    return new Set(Object.keys(firstSchemaEntry.properties as Record<string, unknown>));
}

function extractFixtureRuleOptions(config: Record<string, unknown>, ruleId: string): Record<string, unknown> {
    const schemaPropertyNames = resolveFixtureRuleSchemaPropertyNames(ruleId);
    if (schemaPropertyNames.size === 0) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(extractFixtureRuleOptionCandidates(config)).filter(([key]) => schemaPropertyNames.has(key))
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

    const ruleOptions = extractFixtureRuleOptions(config, ruleId);
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
            const formatOptions = Format.extractProjectFormatOptions(config);
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
            const lintedOutput = result.output ?? inputText ?? "";
            const outputText = await (async () => {
                try {
                    return await runProfiledStage(
                        "format",
                        async () => await Format.format(lintedOutput, formatOptions)
                    );
                } catch {
                    return lintedOutput;
                }
            })();

            return {
                resultKind: "text" as const,
                outputText,
                changed: outputText !== (inputText ?? "")
            };
        }
    });
}
