import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { ESLint } from "eslint";

function createIntegrationLintRules(config: Record<string, unknown>): Record<string, "off" | "warn" | "error"> {
    return { ...Lint.normalizeLintRulesConfig(config) };
}

export function createIntegrationFixtureAdapter() {
    return Object.freeze({
        workspaceName: "integration",
        suiteName: "cross-module integration fixtures",
        supports(kind: string) {
            return kind === "integration";
        },
        async run({ fixtureCase, config, inputText, runProfiledStage }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const formatted = await runProfiledStage(
                "format",
                async () => await Format.format(inputText ?? "", formatOptions)
            );
            const lintRules = createIntegrationLintRules(config);
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
                        rules: lintRules
                    }
                ]
            });
            const [result] = await runProfiledStage(
                "lint",
                async () =>
                    await eslint.lintText(formatted, {
                        filePath: `${fixtureCase.caseId}.gml`
                    })
            );
            const outputText = await runProfiledStage(
                "format",
                async () => await Format.format(result.output ?? formatted, formatOptions)
            );

            return {
                resultKind: "text" as const,
                outputText,
                changed: outputText !== (inputText ?? "")
            };
        }
    });
}
