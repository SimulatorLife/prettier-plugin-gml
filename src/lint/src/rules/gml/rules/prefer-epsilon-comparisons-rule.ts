import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord, isAstNodeWithType, getNodeStartIndex, getNodeEndIndex, type AstNodeRecord } from "../rule-base-helpers.js";

export function createPreferEpsilonComparisonsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                BinaryExpression(node) {
                    if (node.operator !== "==" && node.operator !== "!=") {
                        return;
                    }

                    const isFloatLiteral = (expression: unknown): boolean =>
                        isAstNodeRecord(expression) &&
                        expression.type === "Literal" &&
                        typeof expression.value === "number" &&
                        !Number.isInteger(expression.value);

                    if (isFloatLiteral(node.left) || isFloatLiteral(node.right)) {
                        context.report({
                            node: node as any,
                            messageId: definition.messageId
                        });
                    }
                }
            });
        }
    });
}
