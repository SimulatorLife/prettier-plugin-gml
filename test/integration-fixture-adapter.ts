import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { ESLint } from "eslint";

const DOC_COMMENT_PATTERN = /^\s*\/\/\/\s*(?:\/\s*)?@/iu;

function removeDocCommentLines(text: string): string {
    return text
        .split(/\r?\n/u)
        .filter((line) => !DOC_COMMENT_PATTERN.test(line))
        .join("\n");
}

function canonicalizeFixtureText(text: string): string {
    return removeDocCommentLines(text).trim();
}

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
        async compare({ fixtureCase, caseResult }) {
            assert.equal(caseResult.resultKind, "text");
            const expectedOutput = fixtureCase.expectedFilePath
                ? await readFile(fixtureCase.expectedFilePath, "utf8")
                : fixtureCase.inputFilePath
                  ? await readFile(fixtureCase.inputFilePath, "utf8")
                  : "";
            assert.equal(
                canonicalizeFixtureText(caseResult.outputText),
                canonicalizeFixtureText(expectedOutput),
                `${fixtureCase.caseId} canonicalized integration output must match expected output.`
            );
        },
        async run({ fixtureCase, config, inputText, runProfiledStage }) {
            const formatOptions = Format.extractProjectFormatOptions(config);
            const formatted = await runProfiledStage("format", async () => await Format.format(inputText ?? "", formatOptions));
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
            const [result] = await runProfiledStage("lint", async () =>
                await eslint.lintText(formatted, {
                    filePath: `${fixtureCase.caseId}.gml`
                })
            );
            const outputText = result.output ?? formatted;

            return {
                resultKind: "text" as const,
                outputText,
                changed: outputText !== (inputText ?? "")
            };
        }
    });
}
