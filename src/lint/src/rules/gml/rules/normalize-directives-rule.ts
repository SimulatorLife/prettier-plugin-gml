import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

function normalizeLegacyDirectiveLine(line: string): string {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") && !trimmed.startsWith("#macro")) {
        const parts = trimmed.split(/\s+/u);
        const name = parts[0]?.slice(1);
        if (name === "if" || name === "elseif" || name === "else" || name === "endif") {
            return line;
        }

        if (name === "region" || name === "endregion") {
            return line;
        }

        return line.replace(/^(\s*)#(.*)$/u, "$1//$2");
    }

    return line;
}

export function createNormalizeDirectivesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines = lines.map((line) => normalizeLegacyDirectiveLine(line));

                    const rewritten = rewrittenLines.join(lineEnding);
                    if (rewritten !== text) {
                        context.report({
                            loc: { line: 1, column: 0 },
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                        });
                    }
                }
            });
        }
    });
}
