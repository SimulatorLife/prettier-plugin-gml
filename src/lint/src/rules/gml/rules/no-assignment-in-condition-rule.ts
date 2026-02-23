import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, isAstNodeRecord } from "../rule-base-helpers.js";

export function createNoAssignmentInConditionRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const checkNode = (node: unknown): void => {
                if (!isAstNodeRecord(node)) {
                    return;
                }

                if (node.type === "AssignmentExpression") {
                    const start = getNodeStartIndex(node);
                    const end = getNodeEndIndex(node);
                    context.report({
                        node: node as any,
                        messageId: definition.messageId,
                        fix:
                            typeof start === "number" && typeof end === "number" && node.operator === "="
                                ? (fixer) => {
                                      const text = context.sourceCode.text.slice(start, end);
                                      return fixer.replaceTextRange([start, end], text.replace("=", "=="));
                                  }
                                : undefined
                    });
                }

                CoreWorkspace.Core.forEachNodeChild(node, (child) => checkNode(child));
            };

            return Object.freeze({
                IfStatement(node) {
                    checkNode(node.test);
                },
                WhileStatement(node) {
                    checkNode(node.test);
                },
                DoUntilStatement(node) {
                    checkNode(node.test);
                },
                ForStatement(node) {
                    if (node.test) {
                        checkNode(node.test);
                    }
                }
            });
        }
    });
}
