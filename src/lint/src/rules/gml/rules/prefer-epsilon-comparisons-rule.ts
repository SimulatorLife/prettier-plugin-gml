import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord } from "../rule-base-helpers.js";

function isFloatLiteralExpression(expression: unknown): boolean {
    return (
        isAstNodeRecord(expression) &&
        expression.type === "Literal" &&
        typeof expression.value === "number" &&
        !Number.isInteger(expression.value)
    );
}

export function createPreferEpsilonComparisonsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    if (node.operator !== "==" && node.operator !== "!=") {
                        return;
                    }

                    if (isFloatLiteralExpression(node.left) || isFloatLiteralExpression(node.right)) {
                        context.report({
                            node,
                            messageId: definition.messageId
                        });
                    }
                }
            });
        }
    });
}
