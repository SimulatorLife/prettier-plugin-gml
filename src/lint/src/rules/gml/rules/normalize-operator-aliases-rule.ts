import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, reportFullTextRewrite } from "../rule-base-helpers.js";

function resolveReportLocation(context: Rule.RuleContext, index: number): { line: number; column: number } {
    const sourceCodeWithLocator = context.sourceCode as Rule.RuleContext["sourceCode"] & {
        getLocFromIndex?: (index: number) => { line: number; column: number };
    };

    if (typeof sourceCodeWithLocator.getLocFromIndex === "function") {
        const located = sourceCodeWithLocator.getLocFromIndex(index);
        if (
            typeof located?.line === "number" &&
            Number.isFinite(located.line) &&
            typeof located.column === "number" &&
            Number.isFinite(located.column)
        ) {
            return located;
        }
    }

    const sourceText = context.sourceCode.text;
    const clampedIndex = Math.max(0, Math.min(index, sourceText.length));
    let line = 1;
    let lineStart = 0;
    for (let cursor = 0; cursor < clampedIndex; cursor += 1) {
        if (sourceText[cursor] === "\n") {
            line += 1;
            lineStart = cursor + 1;
        }
    }

    return { line, column: clampedIndex - lineStart };
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
                                loc: resolveReportLocation(context, operatorStart),
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
