import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";

type ControlFlowStatementNode = Readonly<Record<string, unknown> & { type: string }>;

function isControlFlowStatementNode(node: unknown): node is ControlFlowStatementNode {
    return typeof node === "object" && node !== null && typeof Reflect.get(node, "type") === "string";
}

function isBlockStatementNode(node: unknown): boolean {
    return isControlFlowStatementNode(node) && node.type === "BlockStatement";
}

function isIfStatementNode(node: unknown): boolean {
    return isControlFlowStatementNode(node) && node.type === "IfStatement";
}

function reportMissingControlFlowBraces(context: Rule.RuleContext, messageId: string, branchNode: unknown): void {
    if (!isControlFlowStatementNode(branchNode)) {
        return;
    }

    context.report({
        node: branchNode as never,
        messageId
    });
}

function reportMissingBlockBody(context: Rule.RuleContext, messageId: string, bodyNode: unknown): void {
    if (isBlockStatementNode(bodyNode)) {
        return;
    }

    reportMissingControlFlowBraces(context, messageId, bodyNode);
}

export function createRequireControlFlowBracesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition, {
            fixable: null,
            messageText: "Control-flow statements must use braces. Run the formatter to insert them."
        }),
        create(context) {
            return Object.freeze({
                IfStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.consequent);

                    if (node.alternate === null || node.alternate === undefined || isIfStatementNode(node.alternate)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.alternate);
                },
                WhileStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.body);
                },
                ForStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.body);
                },
                RepeatStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.body);
                },
                DoUntilStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.body);
                },
                WithStatement(node: unknown) {
                    if (!isControlFlowStatementNode(node)) {
                        return;
                    }

                    reportMissingBlockBody(context, definition.messageId, node.body);
                }
            });
        }
    });
}
