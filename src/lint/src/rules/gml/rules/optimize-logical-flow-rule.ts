import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import { printNodeForAutofix } from "../../../language/print-expression.js";
import type { GmlRuleDefinition } from "../../catalog.js";
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
const COMMENT_SEQUENCE_PATTERN = /\/\/|\/\*/u;

function containsLogicalNormalizationSignal(sourceText: string): boolean {
    return LOGICAL_NORMALIZATION_SIGNAL_PATTERN.test(sourceText);
}

function containsUnsafeCommentSyntax(sourceText: string): boolean {
    if (!COMMENT_SEQUENCE_PATTERN.test(sourceText)) {
        return false;
    }

    const sourceLength = sourceText.length;
    const scanState = Core.createStringCommentScanState();
    for (let index = 0; index < sourceLength; ) {
        const nextIndex = Core.advanceStringCommentScan(sourceText, sourceLength, index, scanState, true);
        if (nextIndex !== index) {
            if (scanState.inLineComment || scanState.inBlockComment) {
                return true;
            }

            index = nextIndex;
            continue;
        }

        index += 1;
    }

    return false;
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
    let testRecord = asAstRecord(test);
    while (testRecord && testRecord.type === "ParenthesizedExpression") {
        testRecord = asAstRecord(testRecord.expression);
    }

    const targetRecord = asAstRecord(target);
    if (!testRecord || !targetRecord) {
        return false;
    }

    const callee = asAstRecord(testRecord.callee ?? testRecord.object);
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

    const leftUndefined =
        left &&
        ((left.type === "Identifier" && left.name === "undefined") ||
            (left.type === "Literal" && (left.value === undefined || left.value === "undefined")));
    const rightUndefined =
        right &&
        ((right.type === "Identifier" && right.name === "undefined") ||
            (right.type === "Literal" && (right.value === undefined || right.value === "undefined")));

    return (
        (leftUndefined && areComparableAssignmentTargetsEquivalent(right, targetRecord)) ||
        (rightUndefined && areComparableAssignmentTargetsEquivalent(left, targetRecord))
    );
}

function extractAssignmentExpressionFromStatementNode(statementNode: AstRecord | null): AstRecord | null {
    if (!statementNode) {
        return null;
    }

    if (statementNode.type === "AssignmentExpression") {
        return statementNode;
    }

    if (statementNode.type !== "ExpressionStatement") {
        return null;
    }

    const expression = asAstRecord(statementNode.expression);
    if (!expression || expression.type !== "AssignmentExpression") {
        return null;
    }

    return expression;
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

        const consequentExpression = extractAssignmentExpressionFromStatementNode(consequentStatement);
        const alternateExpression = extractAssignmentExpressionFromStatementNode(alternateStatement);
        if (!consequentExpression || !alternateExpression) {
            return false;
        }

        if (consequentExpression.operator !== "=" || alternateExpression.operator !== "=") {
            return false;
        }

        return areComparableAssignmentTargetsEquivalent(consequentExpression.left, alternateExpression.left);
    }

    const consequentExpression = extractAssignmentExpressionFromStatementNode(consequentStatement);
    if (!consequentExpression) {
        return false;
    }

    if (consequentExpression.operator !== "=") {
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
        (argument.type === "BinaryExpression" && (argument.operator === "&&" || argument.operator === "||")) ||
        argument.type === "ParenthesizedExpression"
    );
}

function isBooleanLiteralNode(node: unknown): boolean {
    return readBooleanLiteral(node) !== null;
}

function canLogicalExpressionBenefitFromNormalization(node: unknown): boolean {
    const logicalExpression = asAstRecord(node);
    if (
        !logicalExpression ||
        (logicalExpression.type !== "LogicalExpression" && logicalExpression.type !== "BinaryExpression") ||
        (logicalExpression.operator !== "&&" && logicalExpression.operator !== "||")
    ) {
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
        return (
            left.type === "LogicalExpression" ||
            right.type === "LogicalExpression" ||
            left.type === "BinaryExpression" ||
            right.type === "BinaryExpression"
        );
    }

    if (logicalExpression.operator === "||") {
        return (
            left.type === "LogicalExpression" ||
            right.type === "LogicalExpression" ||
            left.type === "BinaryExpression" ||
            right.type === "BinaryExpression"
        );
    }

    return false;
}

function getNodeRange(node: unknown): SourceTextRange | null {
    const nodeStart = Core.getNodeStartIndex(node as any);
    const nodeEnd = Core.getNodeEndIndex(node as any);
    if (
        typeof nodeStart !== "number" ||
        typeof nodeEnd !== "number" ||
        !Number.isFinite(nodeStart) ||
        !Number.isFinite(nodeEnd) ||
        nodeEnd <= nodeStart
    ) {
        return null;
    }

    return Object.freeze({
        start: nodeStart,
        end: nodeEnd
    });
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
                "BlockStatement, LogicalExpression, BinaryExpression, UnaryExpression[operator='!'], IfStatement"(
                    node: any
                ) {
                    const originalNode = node;
                    const nodeRange = getNodeRange(originalNode);
                    if (!nodeRange) {
                        return;
                    }

                    if (isRangeInsideAnyRange(nodeRange, rewrittenNodeRanges)) {
                        return;
                    }

                    const fullSourceText = context.sourceCode.text;
                    const sourceText = fullSourceText.slice(nodeRange.start, nodeRange.end);
                    if (Core.hasComment(originalNode) || containsUnsafeCommentSyntax(sourceText)) {
                        return;
                    }

                    if (
                        (originalNode.type === "BlockStatement" ||
                            originalNode.type === "LogicalExpression" ||
                            originalNode.type === "BinaryExpression" ||
                            originalNode.type === "UnaryExpression") &&
                        !containsLogicalNormalizationSignal(sourceText)
                    ) {
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

                    if (
                        originalNode.type === "BinaryExpression" &&
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

                    const newText = printNodeForAutofix(normalizationResult.ast, fullSourceText);

                    if (normalizeWhitespaceForComparison(sourceText) !== normalizeWhitespaceForComparison(newText)) {
                        rewrittenNodeRanges.push(nodeRange);

                        context.report({
                            loc: resolveSafeNodeLoc(context, originalNode as unknown),
                            messageId: definition.messageId,
                            fix(fixer) {
                                return fixer.replaceTextRange([nodeRange.start, nodeRange.end], newText);
                            }
                        });
                    }
                }
            });
        }
    });
}
