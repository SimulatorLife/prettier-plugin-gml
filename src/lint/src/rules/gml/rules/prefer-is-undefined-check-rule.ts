import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, isAstNodeRecord } from "../rule-base-helpers.js";

function isUndefinedIdentifier(expression: unknown): boolean {
    return isAstNodeRecord(expression) && expression.type === "Identifier" && expression.name === "undefined";
}

export function createPreferIsUndefinedCheckRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    if (node.operator !== "==" && node.operator !== "!=") {
                        return;
                    }

                    if (isUndefinedIdentifier(node.left) || isUndefinedIdentifier(node.right)) {
                        const otherSide = isUndefinedIdentifier(node.left) ? node.right : node.left;
                        const start = getNodeStartIndex(node);
                        const end = getNodeEndIndex(node);
                        const otherStart = getNodeStartIndex(otherSide);
                        const otherEnd = getNodeEndIndex(otherSide);

                        if (
                            typeof start === "number" &&
                            typeof end === "number" &&
                            typeof otherStart === "number" &&
                            typeof otherEnd === "number"
                        ) {
                            const otherExprText = context.sourceCode.text.slice(otherStart, otherEnd);
                            const replacement =
                                node.operator === "=="
                                    ? `is_undefined(${otherExprText})`
                                    : `!is_undefined(${otherExprText})`;

                            context.report({
                                node,
                                messageId: definition.messageId,
                                fix: (fixer) => fixer.replaceTextRange([start, end], replacement)
                            });
                        }
                    }
                }
            });
        }
    });
}
