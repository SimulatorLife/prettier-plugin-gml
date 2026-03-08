import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { printExpression } from "../expression-printer.js";
import { cloneAstNodeWithoutTraversalLinks, createMeta } from "../rule-base-helpers.js";
import { applyLogicalNormalizationWithChangeMetadata } from "../transforms/logical-expressions/traversal-normalization.js";

/**
 * Normalize whitespace for structural expression comparisons.
 */
function normalizeWhitespaceForComparison(value: string): string {
    return value.replaceAll(/\s+/g, " ");
}

type SourceTextRange = Readonly<{ start: number; end: number }>;

const LOGICAL_NORMALIZATION_SIGNAL_PATTERN = /&&|\|\||!|\b(?:and|or|not|true|false)\b/u;

function containsLogicalNormalizationSignal(sourceText: string): boolean {
    return LOGICAL_NORMALIZATION_SIGNAL_PATTERN.test(sourceText);
}

type AstRecord = Record<string, unknown> & Readonly<{ type?: string }>;

function asAstRecord(value: unknown): AstRecord | null {
    if (!Core.isObjectLike(value)) {
        return null;
    }

    return value as AstRecord;
}

function unwrapSingleStatement(node: unknown): AstRecord | null {
    const record = asAstRecord(node);
    if (!record) {
        return null;
    }

    if (record.type !== "BlockStatement") {
        return record;
    }

    const body = Array.isArray(record.body) ? record.body : [];
    const [firstStatement] = body;
    const firstStatementRecord = asAstRecord(firstStatement);
    if (body.length !== 1 || !firstStatementRecord) {
        return null;
    }

    return firstStatementRecord;
}

function readBooleanLiteral(node: unknown): boolean | null {
    const nodeRecord = asAstRecord(node);
    if (!nodeRecord || nodeRecord.type !== "Literal") {
        return null;
    }

    const value = nodeRecord.value;
    if (value === true || value === "true") {
        return true;
    }
    if (value === false || value === "false") {
        return false;
    }

    return null;
}

function areComparableAssignmentTargetsEquivalent(left: unknown, right: unknown): boolean {
    const leftRecord = asAstRecord(left);
    const rightRecord = asAstRecord(right);
    if (!leftRecord || !rightRecord) {
        return false;
    }

    if (leftRecord.type !== rightRecord.type) {
        return false;
    }

    switch (leftRecord.type) {
        case "Identifier": {
            return typeof leftRecord.name === "string" && leftRecord.name === rightRecord.name;
        }
        case "MemberDotExpression": {
            return (
                areComparableAssignmentTargetsEquivalent(leftRecord.object, rightRecord.object) &&
                areComparableAssignmentTargetsEquivalent(leftRecord.property, rightRecord.property)
            );
        }
        case "MemberIndexExpression": {
            return (
                areComparableAssignmentTargetsEquivalent(leftRecord.object, rightRecord.object) &&
                areComparableAssignmentTargetsEquivalent(leftRecord.index, rightRecord.index)
            );
        }
        default: {
            return false;
        }
    }
}

function isUndefinedCheckAgainstTarget(test: unknown, target: unknown): boolean {
    const testRecord = asAstRecord(test);
    const targetRecord = asAstRecord(target);
    if (!testRecord || !targetRecord) {
        return false;
    }

    const callee = asAstRecord(testRecord.callee);
    const argumentsList = Array.isArray(testRecord.arguments) ? testRecord.arguments : [];
    if (
        testRecord.type === "CallExpression" &&
        callee &&
        callee.type === "Identifier" &&
        callee.name === "is_undefined" &&
        argumentsList.length === 1
    ) {
        return areComparableAssignmentTargetsEquivalent(argumentsList[0], targetRecord);
    }

    if (testRecord.type !== "BinaryExpression" || testRecord.operator !== "==") {
        return false;
    }

    const left = asAstRecord(testRecord.left);
    const right = asAstRecord(testRecord.right);

    const leftUndefined = left && left.type === "Identifier" && left.name === "undefined";
    const rightUndefined = right && right.type === "Identifier" && right.name === "undefined";

    return (
        (leftUndefined && areComparableAssignmentTargetsEquivalent(right, targetRecord)) ||
        (rightUndefined && areComparableAssignmentTargetsEquivalent(left, targetRecord))
    );
}

function canIfStatementBenefitFromNormalization(node: unknown): boolean {
    const ifNode = asAstRecord(node);
    if (!ifNode || ifNode.type !== "IfStatement") {
        return false;
    }

    const consequentStatement = unwrapSingleStatement(ifNode.consequent);
    const alternateStatement = unwrapSingleStatement(ifNode.alternate);

    if (consequentStatement && alternateStatement) {
        if (consequentStatement.type === "ReturnStatement" && alternateStatement.type === "ReturnStatement") {
            const consequentValue = readBooleanLiteral(consequentStatement.argument);
            const alternateValue = readBooleanLiteral(alternateStatement.argument);
            return (
                (consequentValue === true && alternateValue === false) ||
                (consequentValue === false && alternateValue === true)
            );
        }

        if (consequentStatement.type === "ExpressionStatement" && alternateStatement.type === "ExpressionStatement") {
            const consequentExpression = asAstRecord(consequentStatement.expression);
            const alternateExpression = asAstRecord(alternateStatement.expression);
            if (
                !consequentExpression ||
                !alternateExpression ||
                consequentExpression.type !== "AssignmentExpression" ||
                alternateExpression.type !== "AssignmentExpression" ||
                consequentExpression.operator !== "=" ||
                alternateExpression.operator !== "="
            ) {
                return false;
            }

            return areComparableAssignmentTargetsEquivalent(consequentExpression.left, alternateExpression.left);
        }

        return false;
    }

    if (!consequentStatement || consequentStatement.type !== "ExpressionStatement") {
        return false;
    }

    const consequentExpression = asAstRecord(consequentStatement.expression);
    if (
        !consequentExpression ||
        consequentExpression.type !== "AssignmentExpression" ||
        consequentExpression.operator !== "="
    ) {
        return false;
    }

    return isUndefinedCheckAgainstTarget(ifNode.test, consequentExpression.left);
}

function unwrapParenthesizedNode(node: unknown): AstRecord | null {
    let current = asAstRecord(node);
    while (current && current.type === "ParenthesizedExpression") {
        current = asAstRecord(current.expression);
    }
    return current;
}

function canUnaryExpressionBenefitFromNormalization(node: unknown): boolean {
    const unaryExpression = asAstRecord(node);
    if (!unaryExpression || unaryExpression.type !== "UnaryExpression" || unaryExpression.operator !== "!") {
        return false;
    }

    const argument = unwrapParenthesizedNode(unaryExpression.argument);
    if (!argument) {
        return false;
    }

    return (
        argument.type === "UnaryExpression" ||
        argument.type === "LogicalExpression" ||
        argument.type === "ParenthesizedExpression"
    );
}

function isBooleanLiteralNode(node: unknown): boolean {
    return readBooleanLiteral(node) !== null;
}

function canLogicalExpressionBenefitFromNormalization(node: unknown): boolean {
    const logicalExpression = asAstRecord(node);
    if (!logicalExpression || logicalExpression.type !== "LogicalExpression") {
        return false;
    }

    const left = unwrapParenthesizedNode(logicalExpression.left);
    const right = unwrapParenthesizedNode(logicalExpression.right);
    if (!left || !right) {
        return false;
    }

    if (isBooleanLiteralNode(left) || isBooleanLiteralNode(right)) {
        return true;
    }

    if (logicalExpression.operator === "&&") {
        return left.type === "LogicalExpression" || right.type === "LogicalExpression";
    }

    if (logicalExpression.operator === "||") {
        return left.type === "LogicalExpression" || right.type === "LogicalExpression";
    }

    return false;
}

function isRangeInsideAnyRange(range: SourceTextRange, existingRanges: ReadonlyArray<SourceTextRange>): boolean {
    return existingRanges.some((existingRange) => {
        return range.start >= existingRange.start && range.end <= existingRange.end;
    });
}

function resolveSafeNodeLoc(context: Rule.RuleContext, node: unknown): { line: number; column: number } {
    const sourceText = context.sourceCode.text;
    const rawStart = Core.getNodeStartIndex(node as any);
    const startIndex =
        typeof rawStart === "number" && Number.isFinite(rawStart) ? Core.clamp(rawStart, 0, sourceText.length) : 0;
    const sourceCodeWithLocator = context.sourceCode as Rule.RuleContext["sourceCode"] & {
        getLocFromIndex?: (index: number) => { line: number; column: number } | undefined;
    };
    const located =
        typeof sourceCodeWithLocator.getLocFromIndex === "function"
            ? sourceCodeWithLocator.getLocFromIndex(startIndex)
            : undefined;
    if (
        located &&
        typeof located.line === "number" &&
        typeof located.column === "number" &&
        Number.isFinite(located.line) &&
        Number.isFinite(located.column)
    ) {
        return located;
    }

    let line = 1;
    let lastLineStart = 0;
    for (let index = 0; index < startIndex; index += 1) {
        if (sourceText[index] === "\n") {
            line += 1;
            lastLineStart = index + 1;
        }
    }

    return {
        line,
        column: startIndex - lastLineStart
    };
}

export function createOptimizeLogicalFlowRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const rewrittenNodeRanges: SourceTextRange[] = [];

            return Object.freeze({
                "LogicalExpression, UnaryExpression[operator='!'], IfStatement"(node: any) {
                    const originalNode = node;
                    const nodeStart = Core.getNodeStartIndex(originalNode);
                    const nodeEnd = Core.getNodeEndIndex(originalNode);
                    if (
                        typeof nodeStart !== "number" ||
                        typeof nodeEnd !== "number" ||
                        !Number.isFinite(nodeStart) ||
                        !Number.isFinite(nodeEnd) ||
                        nodeEnd <= nodeStart
                    ) {
                        return;
                    }

                    const nodeRange: SourceTextRange = {
                        start: nodeStart,
                        end: nodeEnd
                    };
                    if (isRangeInsideAnyRange(nodeRange, rewrittenNodeRanges)) {
                        return;
                    }

                    const sourceText = context.sourceCode.text.slice(nodeStart, nodeEnd);
                    if (!containsLogicalNormalizationSignal(sourceText)) {
                        return;
                    }

                    if (originalNode.type === "IfStatement" && !canIfStatementBenefitFromNormalization(originalNode)) {
                        return;
                    }

                    if (
                        originalNode.type === "UnaryExpression" &&
                        !canUnaryExpressionBenefitFromNormalization(originalNode)
                    ) {
                        return;
                    }

                    if (
                        originalNode.type === "LogicalExpression" &&
                        !canLogicalExpressionBenefitFromNormalization(originalNode)
                    ) {
                        return;
                    }

                    const cloned = cloneAstNodeWithoutTraversalLinks(node);
                    if (!cloned) {
                        return;
                    }

                    const normalizationResult = applyLogicalNormalizationWithChangeMetadata(cloned);
                    if (!normalizationResult.changed) {
                        return;
                    }

                    const newText = printExpression(normalizationResult.ast, context.sourceCode.text);
                    if (normalizeWhitespaceForComparison(sourceText) !== normalizeWhitespaceForComparison(newText)) {
                        rewrittenNodeRanges.push(nodeRange);

                        context.report({
                            loc: resolveSafeNodeLoc(context, originalNode as unknown),
                            messageId: definition.messageId,
                            fix(fixer) {
                                return fixer.replaceTextRange([nodeStart, nodeEnd], newText);
                            }
                        });
                    }
                }
            });
        }
    });
}
