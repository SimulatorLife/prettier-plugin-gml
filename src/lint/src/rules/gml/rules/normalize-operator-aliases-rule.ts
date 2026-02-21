import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex,getNodeStartIndex } from "../rule-base-helpers.js";

const OPERATOR_ALIASES: ReadonlyMap<string, string> = new Map([
    ["and", "&&"],
    ["or", "||"],
    ["xor", "^^"],
    ["not", "!"],
    ["mod", "%"]
]);

export function createNormalizeOperatorAliasesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    const normalized = OPERATOR_ALIASES.get(node.operator);
                    if (normalized) {
                        const start = getNodeStartIndex(node);
                        const end = getNodeEndIndex(node);
                        if (typeof start === "number" && typeof end === "number") {
                            context.report({
                                node,
                                messageId: definition.messageId,
                                fix: (fixer) => fixer.replaceText(node, normalized)
                            });
                        }
                    }
                },
                UnaryExpression(node) {
                    const normalized = OPERATOR_ALIASES.get(node.operator);
                    if (normalized) {
                        context.report({
                            node,
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceText(node, normalized)
                        });
                    }
                }
            });
        }
    });
}
