import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, reportFullTextRewrite } from "../rule-base-helpers.js";

export function createNormalizeOperatorAliasesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const rewrittenText = sourceText.replaceAll(
                        /(^|[^A-Za-z0-9_])not(?=\s*(?:\(|[A-Za-z_]))\b/giu,
                        "$1!"
                    );
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                },
                BinaryExpression(node) {
                    const normalized = Core.OPERATOR_ALIAS_MAP.get(node.operator);
                    if (normalized) {
                        const operator = String(node.operator);
                        const start = getNodeStartIndex(node);
                        const end = getNodeEndIndex(node);
                        if (
                            typeof start === "number" &&
                            typeof end === "number" &&
                            operator.length > 0 &&
                            normalized !== operator
                        ) {
                            const source = context.sourceCode.text.slice(start, end);
                            const operatorIndex = source.indexOf(operator);
                            if (operatorIndex === -1) {
                                return;
                            }

                            const operatorStart = start + operatorIndex;
                            const operatorEnd = operatorStart + operator.length;
                            context.report({
                                node,
                                messageId: definition.messageId,
                                fix: (fixer) => fixer.replaceTextRange([operatorStart, operatorEnd], normalized)
                            });
                        }
                    }
                },
                UnaryExpression() {
                    // Parse-failure and legacy alias normalization is handled by Program text rewrite.
                }
            });
        }
    });
}
