import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, reportFullTextRewrite } from "../rule-base-helpers.js";

/**
 * Returns true for logical operator aliases (`and`, `or`, `xor`) whose canonical
 * symbol forms (`&&`, `||`, `^^`) are governed by the formatter's `logicalOperatorsStyle`
 * option. The lint rule must not rewrite these operators so that the two tools do not
 * conflict: format converts between keyword and symbol styles bidirectionally, while lint
 * is responsible only for non-style alias normalizations such as `mod` → `%`.
 *
 * See: docs/target-state.md §2.1 – formatter owns "logical operator style rendering".
 */
function isFormatterOwnedLogicalAlias(operator: string): boolean {
    return Core.getOperatorInfo(operator)?.type === "logical";
}

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
                    // Logical operator style (`and`/`or`/`xor` ↔ `&&`/`||`/`^^`) is owned
                    // by the formatter's `logicalOperatorsStyle` option. Rewriting those
                    // aliases here would conflict with the formatter's bidirectional style
                    // control and violate the formatter/lint boundary contract.
                    if (isFormatterOwnedLogicalAlias(node.operator)) {
                        return;
                    }

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
