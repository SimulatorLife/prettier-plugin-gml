import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";
import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, isAstNodeRecord, isAstNodeWithType, type AstNodeRecord } from "../rule-base-helpers.js";

export function createNoAssignmentInConditionRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const checkNode = (node: unknown): void => {
                if (!isAstNodeRecord(node)) {
                    return;
                }

                if (node.type === "AssignmentExpression") {
                    context.report({
                        node: node as any,
                        messageId: definition.messageId
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
