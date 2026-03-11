import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeRecord,
    type AstNodeWithType,
    createMeta,
    getLineIndentationAtOffset,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord,
    isAstNodeWithType,
    walkAstNodes,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";

type LoopNodeType = "ForStatement" | "WhileStatement" | "RepeatStatement" | "DoUntilStatement";

type LoopNode = AstNodeWithType &
    Readonly<{
        type: LoopNodeType;
        body: unknown;
        update?: unknown;
    }>;

type LoopContainerContext = Readonly<{
    loopNode: LoopNode;
}>;

type LoopMutationSummary = Readonly<{
    declaredInsideLoop: ReadonlySet<string>;
    mutatedIdentifierNames: ReadonlySet<string>;
    mutatedMemberRoots: ReadonlySet<string>;
    hasImpureCall: boolean;
}>;

type ExpressionAssessment = Readonly<{
    complexity: number;
    readsMemberAccess: boolean;
}>;

type LoopCandidate = Readonly<{
    loopContext: LoopContainerContext;
    expressionNode: AstNodeWithType;
    expressionStart: number;
    expressionEnd: number;
    preferredHoistName: string;
    score: number;
}>;

type ParentVisitContext = Readonly<{
    node: AstNodeWithType;
    parent: AstNodeWithType | null;
    parentKey: string | null;
}>;

type CommentTokenRangeIndex = Readonly<{
    prefixCounts: Uint32Array;
    sourceLength: number;
}>;

const LOOP_NODE_TYPES = new Set<LoopNodeType>([
    "ForStatement",
    "WhileStatement",
    "RepeatStatement",
    "DoUntilStatement"
]);

const PURE_FUNCTION_NAMES = new Set<string>(["abs", "dcos", "point_distance"]);

const NON_DETERMINISTIC_IDENTIFIER_NAMES = new Set<string>([
    "current_time",
    "current_year",
    "current_month",
    "current_day",
    "current_weekday",
    "current_hour",
    "current_minute",
    "current_second",
    "date_current_datetime",
    "date_current_date",
    "date_current_time"
]);

const SAFE_INDEX_ACCESSORS = new Set<string>(["[", "[@"]);

function normalizeIdentifierName(identifierName: string): string {
    return Core.toNormalizedLowerCaseString(identifierName);
}

function isCommentTokenBoundary(sourceText: string, index: number): boolean {
    const character = sourceText[index];
    const nextCharacter = sourceText[index + 1];
    if (character === "/" && (nextCharacter === "/" || nextCharacter === "*")) {
        return true;
    }

    return character === "*" && nextCharacter === "/";
}

function createCommentTokenRangeIndex(sourceText: string): CommentTokenRangeIndex {
    const sourceLength = sourceText.length;
    const prefixCounts = new Uint32Array(sourceLength + 1);

    for (let index = 0; index < sourceLength; index += 1) {
        prefixCounts[index + 1] = prefixCounts[index];
        if (index < sourceLength - 1 && isCommentTokenBoundary(sourceText, index)) {
            prefixCounts[index + 1] += 1;
        }
    }

    return {
        prefixCounts,
        sourceLength
    };
}

function rangeContainsCommentToken(
    commentTokenRangeIndex: CommentTokenRangeIndex,
    start: number,
    end: number
): boolean {
    if (end - start < 2) {
        return false;
    }

    const clampedStart = Math.min(Math.max(start, 0), commentTokenRangeIndex.sourceLength);
    const clampedEndExclusive = Math.min(Math.max(end - 1, 0), commentTokenRangeIndex.sourceLength);
    if (clampedEndExclusive <= clampedStart) {
        return false;
    }

    return commentTokenRangeIndex.prefixCounts[clampedEndExclusive] > commentTokenRangeIndex.prefixCounts[clampedStart];
}

function isLoopNode(node: unknown): node is LoopNode {
    return isAstNodeWithType(node) && LOOP_NODE_TYPES.has(node.type as LoopNodeType);
}

function isIdentifierNode(node: unknown): node is AstNodeRecord & Readonly<{ type: "Identifier"; name: string }> {
    return isAstNodeRecord(node) && node.type === "Identifier" && typeof node.name === "string";
}

function readIdentifierName(node: unknown): string | null {
    if (!isIdentifierNode(node)) {
        return null;
    }

    return node.name;
}

function unwrapParenthesizedExpression(node: unknown): unknown {
    let current = node;
    while (isAstNodeRecord(current) && current.type === "ParenthesizedExpression") {
        current = current.expression;
    }

    return current;
}

function readRootIdentifierName(node: unknown): string | null {
    const current = unwrapParenthesizedExpression(node);
    if (!isAstNodeRecord(current)) {
        return null;
    }

    if (current.type === "Identifier") {
        return typeof current.name === "string" ? current.name : null;
    }

    if (current.type === "MemberDotExpression" || current.type === "MemberIndexExpression") {
        return readRootIdentifierName(current.object);
    }

    return null;
}

function collectLoopContainerContexts(programNode: unknown): ReadonlyArray<LoopContainerContext> {
    const contexts: Array<LoopContainerContext> = [];

    walkAstNodesWithParent(programNode, (visitContext) => {
        const { node, parent, parentKey, parentIndex } = visitContext;
        if (!isLoopNode(node)) {
            return;
        }

        if (parent === null || parentKey !== "body" || typeof parentIndex !== "number") {
            return;
        }

        if (parent.type !== "Program" && parent.type !== "BlockStatement") {
            return;
        }

        contexts.push(
            Object.freeze({
                loopNode: node
            })
        );
    });

    return contexts;
}

function walkNodeWithParentSkippingNestedLoops(rootNode: unknown, visit: (context: ParentVisitContext) => void): void {
    if (!isAstNodeWithType(rootNode)) {
        return;
    }

    const stack: Array<ParentVisitContext> = [{ node: rootNode, parent: null, parentKey: null }];
    const seen = new WeakSet<object>();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        const currentObject = current.node as object;
        if (seen.has(currentObject)) {
            continue;
        }

        seen.add(currentObject);
        visit(current);

        if (current.node !== rootNode && isLoopNode(current.node)) {
            continue;
        }

        for (const key of Object.keys(current.node)) {
            if (key === "parent") {
                continue;
            }

            const value = current.node[key];
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index -= 1) {
                    const child = value[index];
                    if (!isAstNodeWithType(child)) {
                        continue;
                    }

                    stack.push({
                        node: child,
                        parent: current.node,
                        parentKey: key
                    });
                }
                continue;
            }

            if (!isAstNodeWithType(value)) {
                continue;
            }

            stack.push({
                node: value,
                parent: current.node,
                parentKey: key
            });
        }
    }
}

function collectIdentifierNamesInProgram(programNode: unknown): ReadonlySet<string> {
    const names = new Set<string>();

    walkAstNodes(programNode, (node) => {
        const identifierName = readIdentifierName(node);
        if (identifierName) {
            names.add(identifierName);
        }
    });

    return names;
}

function collectNormalizedIdentifierNames(identifierNames: ReadonlySet<string>): Set<string> {
    const normalizedNames = new Set<string>();
    for (const identifierName of identifierNames) {
        normalizedNames.add(normalizeIdentifierName(identifierName));
    }

    return normalizedNames;
}

function collectMutatedNamesFromTarget(
    targetNode: unknown,
    mutatedIdentifierNames: Set<string>,
    mutatedMemberRoots: Set<string>
): void {
    const normalizedTarget = unwrapParenthesizedExpression(targetNode);
    if (!isAstNodeRecord(normalizedTarget)) {
        return;
    }

    if (normalizedTarget.type === "Identifier") {
        if (typeof normalizedTarget.name === "string") {
            mutatedIdentifierNames.add(normalizeIdentifierName(normalizedTarget.name));
        }
        return;
    }

    if (normalizedTarget.type === "MemberDotExpression" || normalizedTarget.type === "MemberIndexExpression") {
        const rootIdentifierName = readRootIdentifierName(normalizedTarget.object);
        if (rootIdentifierName) {
            mutatedMemberRoots.add(normalizeIdentifierName(rootIdentifierName));
        }
        collectMutatedNamesFromTarget(normalizedTarget.object, mutatedIdentifierNames, mutatedMemberRoots);
    }
}

function isPureFunctionName(functionName: string | null): boolean {
    if (!functionName) {
        return false;
    }

    return PURE_FUNCTION_NAMES.has(normalizeIdentifierName(functionName));
}

function isIdentifierInvariant(identifierName: string, mutationSummary: LoopMutationSummary): boolean {
    const normalizedIdentifierName = normalizeIdentifierName(identifierName);
    if (!normalizedIdentifierName) {
        return false;
    }

    if (NON_DETERMINISTIC_IDENTIFIER_NAMES.has(normalizedIdentifierName)) {
        return false;
    }

    if (
        mutationSummary.declaredInsideLoop.has(normalizedIdentifierName) ||
        mutationSummary.mutatedIdentifierNames.has(normalizedIdentifierName)
    ) {
        return false;
    }

    return true;
}

function collectLoopMutationSummary(loopNode: LoopNode): LoopMutationSummary {
    const declaredInsideLoop = new Set<string>();
    const mutatedIdentifierNames = new Set<string>();
    const mutatedMemberRoots = new Set<string>();
    let hasImpureCall = false;

    const inspectNode = (node: unknown): void => {
        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "VariableDeclarator") {
            const declaredName = readIdentifierName(node.id);
            if (declaredName) {
                const normalizedName = normalizeIdentifierName(declaredName);
                declaredInsideLoop.add(normalizedName);
                mutatedIdentifierNames.add(normalizedName);
            }
            return;
        }

        if (node.type === "AssignmentExpression") {
            collectMutatedNamesFromTarget(node.left, mutatedIdentifierNames, mutatedMemberRoots);
            return;
        }

        if (node.type === "IncDecExpression" || node.type === "IncDecStatement") {
            collectMutatedNamesFromTarget(node.argument, mutatedIdentifierNames, mutatedMemberRoots);
            return;
        }

        if (node.type === "CallExpression") {
            const callName = Core.getCallExpressionIdentifierName(node);
            if (!isPureFunctionName(callName)) {
                hasImpureCall = true;
            }
            return;
        }

        if (node.type === "NewExpression") {
            hasImpureCall = true;
        }
    };

    walkAstNodes(loopNode.body, inspectNode);
    if (isAstNodeRecord(loopNode.update)) {
        walkAstNodes(loopNode.update, inspectNode);
    }

    return Object.freeze({
        declaredInsideLoop,
        mutatedIdentifierNames,
        mutatedMemberRoots,
        hasImpureCall
    });
}

function isDisallowedContextForReplacement(parent: AstNodeWithType | null, parentKey: string | null): boolean {
    if (!parent || !parentKey) {
        return true;
    }

    if (parent.type === "AssignmentExpression" && parentKey === "left") {
        return true;
    }

    if (parent.type === "VariableDeclarator" && parentKey === "id") {
        return true;
    }

    if ((parent.type === "IncDecExpression" || parent.type === "IncDecStatement") && parentKey === "argument") {
        return true;
    }

    if (parent.type === "CallExpression" && parentKey === "object") {
        return true;
    }

    if (parent.type === "MemberDotExpression" && parentKey === "property") {
        return true;
    }

    if (parent.type === "NewExpression" && parentKey === "expression") {
        return true;
    }

    return false;
}

function evaluateTemplateStringExpressionHoistability(
    templateExpression: AstNodeRecord,
    mutationSummary: LoopMutationSummary,
    assessmentCache: WeakMap<AstNodeRecord, ExpressionAssessment | null>
): ExpressionAssessment | null {
    const atomNodes = Array.isArray(templateExpression.atoms) ? templateExpression.atoms : [];
    let complexity = 1;
    let readsMemberAccess = false;

    for (const atom of atomNodes) {
        if (!isAstNodeRecord(atom) || atom.type === "TemplateStringText") {
            continue;
        }

        const atomAssessment = evaluateExpressionHoistability(atom, mutationSummary, assessmentCache);
        if (!atomAssessment) {
            return null;
        }

        complexity += atomAssessment.complexity;
        readsMemberAccess = readsMemberAccess || atomAssessment.readsMemberAccess;
    }

    return { complexity, readsMemberAccess };
}

function evaluateMemberAccessHoistability(
    expression: AstNodeRecord,
    mutationSummary: LoopMutationSummary,
    assessmentCache: WeakMap<AstNodeRecord, ExpressionAssessment | null>
): ExpressionAssessment | null {
    const objectAssessment = evaluateExpressionHoistability(expression.object, mutationSummary, assessmentCache);
    const rootIdentifierName = readRootIdentifierName(expression.object);
    if (!objectAssessment || !rootIdentifierName) {
        return null;
    }

    const normalizedRootIdentifierName = normalizeIdentifierName(rootIdentifierName);
    if (
        mutationSummary.declaredInsideLoop.has(normalizedRootIdentifierName) ||
        mutationSummary.mutatedIdentifierNames.has(normalizedRootIdentifierName) ||
        mutationSummary.mutatedMemberRoots.has(normalizedRootIdentifierName)
    ) {
        return null;
    }

    if (expression.type === "MemberDotExpression") {
        return readIdentifierName(expression.property)
            ? { complexity: objectAssessment.complexity + 1, readsMemberAccess: true }
            : null;
    }

    if (typeof expression.accessor !== "string" || !SAFE_INDEX_ACCESSORS.has(expression.accessor)) {
        return null;
    }

    const properties = Array.isArray(expression.property) ? expression.property : [];
    if (properties.length !== 1) {
        return null;
    }

    const propertyAssessment = evaluateExpressionHoistability(properties[0], mutationSummary, assessmentCache);
    if (!propertyAssessment) {
        return null;
    }

    return {
        complexity: objectAssessment.complexity + propertyAssessment.complexity + 1,
        readsMemberAccess: true
    };
}

function evaluateCallExpressionHoistability(
    callExpression: AstNodeRecord,
    mutationSummary: LoopMutationSummary,
    assessmentCache: WeakMap<AstNodeRecord, ExpressionAssessment | null>
): ExpressionAssessment | null {
    const functionName = Core.getCallExpressionIdentifierName(callExpression);
    if (!isPureFunctionName(functionName)) {
        return null;
    }

    const callArguments = Core.getCallExpressionArguments(callExpression);
    let complexity = 1;
    let readsMemberAccess = false;

    for (const argumentNode of callArguments) {
        const argumentAssessment = evaluateExpressionHoistability(argumentNode, mutationSummary, assessmentCache);
        if (!argumentAssessment) {
            return null;
        }

        complexity += argumentAssessment.complexity;
        readsMemberAccess = readsMemberAccess || argumentAssessment.readsMemberAccess;
    }

    return { complexity, readsMemberAccess };
}

function evaluateExpressionHoistability(
    expressionNode: unknown,
    mutationSummary: LoopMutationSummary,
    assessmentCache: WeakMap<AstNodeRecord, ExpressionAssessment | null>
): ExpressionAssessment | null {
    const normalizedExpression = unwrapParenthesizedExpression(expressionNode);
    if (!isAstNodeRecord(normalizedExpression)) {
        return null;
    }

    if (assessmentCache.has(normalizedExpression)) {
        return assessmentCache.get(normalizedExpression) ?? null;
    }

    let assessment: ExpressionAssessment | null;
    switch (normalizedExpression.type) {
        case "Literal": {
            assessment = { complexity: 1, readsMemberAccess: false };
            break;
        }
        case "Identifier": {
            assessment =
                typeof normalizedExpression.name === "string" &&
                isIdentifierInvariant(normalizedExpression.name, mutationSummary)
                    ? { complexity: 1, readsMemberAccess: false }
                    : null;
            break;
        }
        case "UnaryExpression": {
            const argumentAssessment = evaluateExpressionHoistability(
                normalizedExpression.argument,
                mutationSummary,
                assessmentCache
            );
            assessment = argumentAssessment
                ? {
                      complexity: argumentAssessment.complexity + 1,
                      readsMemberAccess: argumentAssessment.readsMemberAccess
                  }
                : null;
            break;
        }
        case "BinaryExpression": {
            const leftAssessment = evaluateExpressionHoistability(
                normalizedExpression.left,
                mutationSummary,
                assessmentCache
            );
            const rightAssessment = evaluateExpressionHoistability(
                normalizedExpression.right,
                mutationSummary,
                assessmentCache
            );
            assessment =
                leftAssessment && rightAssessment
                    ? {
                          complexity: leftAssessment.complexity + rightAssessment.complexity + 1,
                          readsMemberAccess: leftAssessment.readsMemberAccess || rightAssessment.readsMemberAccess
                      }
                    : null;
            break;
        }
        case "TernaryExpression": {
            const testAssessment = evaluateExpressionHoistability(
                normalizedExpression.test,
                mutationSummary,
                assessmentCache
            );
            const consequentAssessment = evaluateExpressionHoistability(
                normalizedExpression.consequent,
                mutationSummary,
                assessmentCache
            );
            const alternateAssessment = evaluateExpressionHoistability(
                normalizedExpression.alternate,
                mutationSummary,
                assessmentCache
            );
            assessment =
                testAssessment && consequentAssessment && alternateAssessment
                    ? {
                          complexity:
                              testAssessment.complexity +
                              consequentAssessment.complexity +
                              alternateAssessment.complexity +
                              1,
                          readsMemberAccess:
                              testAssessment.readsMemberAccess ||
                              consequentAssessment.readsMemberAccess ||
                              alternateAssessment.readsMemberAccess
                      }
                    : null;
            break;
        }
        case "TemplateStringExpression": {
            assessment = evaluateTemplateStringExpressionHoistability(
                normalizedExpression,
                mutationSummary,
                assessmentCache
            );
            break;
        }
        case "MemberDotExpression":
        case "MemberIndexExpression": {
            assessment = evaluateMemberAccessHoistability(normalizedExpression, mutationSummary, assessmentCache);
            break;
        }
        case "CallExpression": {
            assessment = evaluateCallExpressionHoistability(normalizedExpression, mutationSummary, assessmentCache);
            break;
        }
        default: {
            assessment = null;
            break;
        }
    }

    assessmentCache.set(normalizedExpression, assessment);
    return assessment;
}

function choosePreferredHoistName(
    parentNode: AstNodeWithType | null,
    parentKey: string | null,
    candidateNode: AstNodeWithType
): string {
    if (candidateNode.type === "TemplateStringExpression") {
        return "cached_text";
    }

    if (
        parentNode !== null &&
        parentKey === "test" &&
        (parentNode.type === "IfStatement" ||
            parentNode.type === "WhileStatement" ||
            parentNode.type === "ForStatement" ||
            parentNode.type === "DoUntilStatement")
    ) {
        return "cached_condition";
    }

    return "cached_value";
}

function findBestLoopCandidate(parameters: {
    commentTokenRangeIndex: CommentTokenRangeIndex;
    loopContext: LoopContainerContext;
    mutationSummary: LoopMutationSummary;
}): LoopCandidate | null {
    let bestCandidate: LoopCandidate | null = null;
    const assessmentCache = new WeakMap<AstNodeRecord, ExpressionAssessment | null>();

    walkNodeWithParentSkippingNestedLoops(parameters.loopContext.loopNode.body, (visitContext) => {
        const { node, parent, parentKey } = visitContext;

        if (node.type === "ParenthesizedExpression") {
            return;
        }

        if (isDisallowedContextForReplacement(parent, parentKey)) {
            return;
        }

        const expressionStart = getNodeStartIndex(node);
        const expressionEnd = getNodeEndIndex(node);
        if (
            typeof expressionStart !== "number" ||
            typeof expressionEnd !== "number" ||
            expressionEnd <= expressionStart
        ) {
            return;
        }

        const assessment = evaluateExpressionHoistability(node, parameters.mutationSummary, assessmentCache);
        if (!assessment) {
            return;
        }

        const minimumComplexity = node.type === "TemplateStringExpression" ? 2 : 3;
        if (assessment.complexity < minimumComplexity) {
            return;
        }

        if (parameters.mutationSummary.hasImpureCall && assessment.readsMemberAccess) {
            return;
        }

        if (rangeContainsCommentToken(parameters.commentTokenRangeIndex, expressionStart, expressionEnd)) {
            return;
        }

        const preferredHoistName = choosePreferredHoistName(parent, parentKey, node);
        const score = assessment.complexity * 1000 + (expressionEnd - expressionStart);
        const candidate: LoopCandidate = {
            loopContext: parameters.loopContext,
            expressionNode: node,
            expressionStart,
            expressionEnd,
            preferredHoistName,
            score
        };
        if (
            bestCandidate === null ||
            candidate.score > bestCandidate.score ||
            (candidate.score === bestCandidate.score && candidate.expressionStart < bestCandidate.expressionStart)
        ) {
            bestCandidate = candidate;
        }
    });

    return bestCandidate;
}

function resolveUniqueHoistIdentifierName(parameters: {
    preferredName: string;
    localIdentifierNames: ReadonlySet<string>;
    normalizedLocalIdentifierNames: ReadonlySet<string>;
}): string | null {
    const baseName = parameters.preferredName.length > 0 ? parameters.preferredName : "cached_value";
    for (let suffix = 0; suffix <= 1000; suffix += 1) {
        const candidateName = suffix === 0 ? baseName : `${baseName}_${suffix}`;
        if (!parameters.normalizedLocalIdentifierNames.has(normalizeIdentifierName(candidateName))) {
            return candidateName;
        }
    }

    return null;
}

/**
 * Creates the `gml/prefer-loop-invariant-expressions` rule.
 *
 * The rule hoists a single provably-safe invariant expression per loop into a
 * cached `var` declaration inserted immediately before the loop.
 */
export function createPreferLoopInvariantExpressionsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program(programNode) {
                    const sourceText = context.sourceCode.text;
                    const lineEnding = Core.dominantLineEnding(sourceText);
                    const localIdentifierNames = new Set(collectIdentifierNamesInProgram(programNode));
                    const normalizedLocalIdentifierNames = collectNormalizedIdentifierNames(localIdentifierNames);
                    const loopContexts = collectLoopContainerContexts(programNode);
                    const commentTokenRangeIndex = createCommentTokenRangeIndex(sourceText);

                    for (const loopContext of loopContexts) {
                        const mutationSummary = collectLoopMutationSummary(loopContext.loopNode);
                        const bestCandidate = findBestLoopCandidate({
                            commentTokenRangeIndex,
                            loopContext,
                            mutationSummary
                        });
                        if (!bestCandidate) {
                            continue;
                        }

                        const hoistIdentifierName = resolveUniqueHoistIdentifierName({
                            preferredName: bestCandidate.preferredHoistName,
                            localIdentifierNames,
                            normalizedLocalIdentifierNames
                        });
                        if (!hoistIdentifierName) {
                            continue;
                        }

                        localIdentifierNames.add(hoistIdentifierName);
                        normalizedLocalIdentifierNames.add(normalizeIdentifierName(hoistIdentifierName));

                        const loopStart = getNodeStartIndex(loopContext.loopNode);
                        if (typeof loopStart !== "number") {
                            continue;
                        }

                        const indentation = getLineIndentationAtOffset(sourceText, loopStart);
                        const expressionText = sourceText.slice(
                            bestCandidate.expressionStart,
                            bestCandidate.expressionEnd
                        );
                        const declarationText =
                            `${indentation}var ${hoistIdentifierName} = ${expressionText};` + `${lineEnding}`;

                        context.report({
                            node: bestCandidate.expressionNode,
                            messageId: definition.messageId,
                            fix: (fixer) => [
                                fixer.replaceTextRange([loopStart, loopStart], declarationText),
                                fixer.replaceTextRange(
                                    [bestCandidate.expressionStart, bestCandidate.expressionEnd],
                                    hoistIdentifierName
                                )
                            ]
                        });
                    }
                }
            });
        }
    });
}
