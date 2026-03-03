import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, reportFullTextRewrite } from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

function expressionLooksMathSensitive(expression: string): boolean {
    const normalized = expression.toLowerCase();
    return (
        normalized.includes("sqr(") ||
        normalized.includes("sqrt(") ||
        normalized.includes("point_distance") ||
        normalized.includes("lengthdir_") ||
        normalized.includes("math_")
    );
}

export function createPreferEpsilonComparisonsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(sourceText);
                    const lines = sourceText.split(/\r?\n/u);
                    const mathSensitiveVariables = new Set<string>();

                    for (const line of lines) {
                        const declarationMatch = /^\s*var\s+([A-Za-z_]\w*)\s*=\s*(.+?);\s*$/u.exec(line);
                        if (!declarationMatch) {
                            continue;
                        }

                        const variableName = declarationMatch[1] ?? "";
                        const expression = declarationMatch[2] ?? "";
                        if (expressionLooksMathSensitive(expression)) {
                            mathSensitiveVariables.add(variableName);
                        }
                    }

                    const hasEpsilonDeclaration = lines.some((line) =>
                        /^\s*var\s+eps\s*=\s*math_get_epsilon\(\)\s*;\s*$/u.test(line)
                    );

                    const rewrittenLines: Array<string> = [];
                    let insertedEpsilonDeclaration = hasEpsilonDeclaration;
                    for (const line of lines) {
                        const zeroCheckMatch = /^(\s*)if\s*\(\s*([A-Za-z_]\w*)\s*==\s*0\s*\)(.*)$/u.exec(line);
                        if (!zeroCheckMatch) {
                            rewrittenLines.push(line);
                            continue;
                        }

                        const indentation = zeroCheckMatch[1] ?? "";
                        const variableName = zeroCheckMatch[2] ?? "";
                        const suffix = zeroCheckMatch[3] ?? "";
                        if (!mathSensitiveVariables.has(variableName)) {
                            rewrittenLines.push(line);
                            continue;
                        }

                        if (!insertedEpsilonDeclaration) {
                            rewrittenLines.push(`${indentation}var eps = math_get_epsilon();`);
                            insertedEpsilonDeclaration = true;
                        }

                        rewrittenLines.push(`${indentation}if (${variableName} <= eps)${suffix}`);
                    }

                    const rewrittenText = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
