import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    applySourceTextEdits,
    createMeta,
    getNodeEndIndex,
    isAstNodeRecord,
    reportFullTextRewrite,
    walkAstNodes
} from "../rule-base-helpers.js";

type MemberIndexExpressionNode = Readonly<{
    type: "MemberIndexExpression";
    object?: unknown;
    property?: unknown;
    accessor?: unknown;
}>;

function isMemberIndexExpressionNode(node: unknown): node is MemberIndexExpressionNode {
    return isAstNodeRecord(node) && node.type === "MemberIndexExpression";
}

function shouldNormalizeMemberIndexAccessorToGrid(node: MemberIndexExpressionNode): boolean {
    return node.accessor !== "[#" && Array.isArray(node.property) && node.property.length > 1;
}

function findMemberIndexAccessorRange(
    sourceText: string,
    memberIndexExpression: MemberIndexExpressionNode
): { start: number; end: number } | null {
    const objectEnd = getNodeEndIndex(memberIndexExpression.object);
    const nodeEnd = getNodeEndIndex(memberIndexExpression);
    if (
        typeof objectEnd !== "number" ||
        !Number.isFinite(objectEnd) ||
        typeof nodeEnd !== "number" ||
        !Number.isFinite(nodeEnd) ||
        nodeEnd <= objectEnd
    ) {
        return null;
    }

    const memberText = sourceText.slice(objectEnd, nodeEnd);
    const bracketOffset = memberText.indexOf("[");
    if (bracketOffset === -1) {
        return null;
    }

    const start = objectEnd + bracketOffset;
    return { start, end: start + 2 };
}

export function createNormalizeDataStructureAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(programNode: unknown) {
                    const sourceText = context.sourceCode.text;
                    const edits: Array<{ start: number; end: number; text: string }> = [];

                    walkAstNodes(programNode, (node: unknown) => {
                        if (!isMemberIndexExpressionNode(node) || !shouldNormalizeMemberIndexAccessorToGrid(node)) {
                            return;
                        }

                        const accessorRange = findMemberIndexAccessorRange(sourceText, node);
                        if (!accessorRange) {
                            return;
                        }

                        edits.push({
                            start: accessorRange.start,
                            end: accessorRange.end,
                            text: "[#"
                        });
                    });

                    const rewrittenText = applySourceTextEdits(sourceText, edits);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
