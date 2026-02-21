import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord } from "../rule-base-helpers.js";

export function createPreferStringInterpolationRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    if (node.operator !== "+") {
                        return;
                    }

                    const isString = (expression: unknown): boolean =>
                        isAstNodeRecord(expression) &&
                        expression.type === "Literal" &&
                        typeof expression.value === "string";

                    if (isString(node.left) || isString(node.right)) {
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
