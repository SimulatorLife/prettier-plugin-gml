import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeStartIndex, getNodeEndIndex } from "../rule-base-helpers.js";

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
                                node: node as any,
                                messageId: definition.messageId,
                                fix: (fixer) => fixer.replaceText(node as any, normalized)
                            });
                        }
                    }
                },
                UnaryExpression(node) {
                    const normalized = OPERATOR_ALIASES.get(node.operator);
                    if (normalized) {
                        context.report({
                            node: node as any,
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceText(node as any, normalized)
                        });
                    }
                }
            });
        }
    });
}
