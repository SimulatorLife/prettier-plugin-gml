import { ESLint, type Linter } from "eslint";

import { Lint } from "../../index.js";

function extractRuleOptions(config: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== "fixture" && key !== "lintRules" && key !== "refactor")
    );
}

function deriveFixtureRuleTarget(caseId: string): Readonly<{ kind: "gml" | "feather"; ruleName: string }> {
    const [firstSegment, secondSegment] = caseId.split("/");
    if (firstSegment === "feather") {
        if (!secondSegment) {
            throw new Error(`Unable to derive feather rule target from fixture case '${caseId}'.`);
        }
        const featherRuleMatch = /^gm\d{4}/u.exec(secondSegment);
        if (!featherRuleMatch) {
            throw new Error(`Unable to derive feather rule target from fixture case '${caseId}'.`);
        }
        return Object.freeze({
            kind: "feather",
            ruleName: featherRuleMatch[0]
        });
    }

    if (!firstSegment) {
        throw new Error(`Unable to derive gml rule target from fixture case '${caseId}'.`);
    }

    return Object.freeze({
        kind: "gml",
        ruleName: firstSegment
    });
}

function resolveEnabledRuleIds(
    fixtureTarget: Readonly<{ kind: "gml" | "feather"; ruleName: string }>,
    config: Record<string, unknown>
): Readonly<{ resolvedRuleId: string; ruleOptions: Record<string, unknown> }> {
    const normalizedRules = Lint.normalizeLintRulesConfig(config);
    const enabledRuleIds = Object.entries(normalizedRules)
        .filter(([, level]) => level === "error")
        .map(([ruleId]) => ruleId);
    const ruleOptions = extractRuleOptions(config);
    const expectedPrefix = fixtureTarget.kind === "gml" ? "gml/" : "feather/";
    const expectedRuleId = `${expectedPrefix}${fixtureTarget.ruleName}`;

    if (enabledRuleIds.includes(expectedRuleId)) {
        return Object.freeze({
            resolvedRuleId: expectedRuleId,
            ruleOptions
        });
    }

    if (enabledRuleIds.length === 1) {
        const [resolvedRuleId] = enabledRuleIds;
        if (!resolvedRuleId) {
            throw new Error(`No enabled lint rule could be resolved for fixture '${fixtureTarget.ruleName}'.`);
        }
        return Object.freeze({
            resolvedRuleId,
            ruleOptions
        });
    }

    throw new Error(
        `Fixture '${fixtureTarget.ruleName}' must enable ${expectedRuleId} or exactly one ${fixtureTarget.kind} rule.`
    );
}

function createLintRuleConfig(
    fixtureTarget: Readonly<{ kind: "gml" | "feather"; ruleName: string }>,
    config: Record<string, unknown>
): Record<string, Linter.RuleEntry> {
    const { resolvedRuleId, ruleOptions } = resolveEnabledRuleIds(fixtureTarget, config);
    return {
        [resolvedRuleId]: Object.keys(ruleOptions).length > 0 ? (["error", ruleOptions] as Linter.RuleEntry) : "error"
    };
}

export function createLintFixtureAdapter() {
    return Object.freeze({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        supports(kind: string) {
            return kind === "lint";
        },
        async run({ fixtureCase, config, inputText, runProfiledStage }) {
            const fixtureTarget = deriveFixtureRuleTarget(fixtureCase.caseId);
            const rules = createLintRuleConfig(fixtureTarget, config);
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
                        rules
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
