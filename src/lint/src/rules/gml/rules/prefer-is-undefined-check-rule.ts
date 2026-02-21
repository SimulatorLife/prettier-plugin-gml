import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord, isAstNodeWithType, getNodeStartIndex, getNodeEndIndex, type AstNodeRecord } from "../rule-base-helpers.js";

export function createPreferIsUndefinedCheckRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    if (node.operator !== "==" && node.operator !== "!=") {
                        return;
                    }

                    const isUndefined = (expression: unknown): boolean =>
                        isAstNodeRecord(expression) &&
                        expression.type === "Identifier" &&
                        expression.name === "undefined";

                    if (isUndefined(node.left) || isUndefined(node.right)) {
                        const otherSide = isUndefined(node.left) ? node.right : node.left;
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
                            const replacement = node.operator === "=="
                                ? `is_undefined(${otherExprText})`
                                : `!is_undefined(${otherExprText})`;

                            context.report({
                                node: node as any,
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
