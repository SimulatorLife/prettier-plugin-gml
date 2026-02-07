import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import { createParserTransform } from "./functional-transform.js";
import {
    applyLogicalExpressionCondensation,
    type OptimizeLogicalExpressionsOptions
} from "./logical-expressions/condensation.js";

type StatementList = Array<MutableGameMakerAstNode | null | undefined>;
type MutableAstRecord = MutableGameMakerAstNode & Record<string, unknown>;

const IGNORED_CHILD_KEYS = new Set([
    "start",
    "end",
    "comments",
    "parent",
    "enclosingNode",
    "precedingNode",
    "followingNode"
]);

function execute(ast: MutableGameMakerAstNode, options: OptimizeLogicalExpressionsOptions): MutableGameMakerAstNode {
    applyLogicalExpressionCondensation(ast, options.helpers);
    eliminateRedundantTemporaryReturns(ast);
    optimizeConditionalMemberAccessCaching(ast);
    return ast;
}

function eliminateRedundantTemporaryReturns(ast: MutableGameMakerAstNode): void {
    const body = Array.isArray((ast as MutableAstRecord).body)
        ? ((ast as MutableAstRecord).body as StatementList)
        : null;
    if (!body) {
        return;
    }

    processStatementListForTempReturnElimination(body);
}

function processStatementListForTempReturnElimination(statements: StatementList): void {
    if (!Array.isArray(statements)) {
        return;
    }

    for (const statement of statements) {
        if (!Core.isObjectLike(statement)) {
            continue;
        }

        visitStatementChildrenForTempReturnElimination(statement);
    }

    for (let index = 0; index < statements.length - 1; index += 1) {
        const replacement = maybeBuildRedundantTempReturnReplacement(statements[index], statements[index + 1]);
        if (!replacement) {
            continue;
        }

        statements.splice(index, 2, replacement);
    }
}

function visitStatementChildrenForTempReturnElimination(statement: MutableGameMakerAstNode): void {
    const nodeRecord = statement as MutableAstRecord;

    if (Array.isArray(nodeRecord.body)) {
        processStatementListForTempReturnElimination(nodeRecord.body as StatementList);
    } else if (Core.isObjectLike(nodeRecord.body)) {
        visitStatementChildrenForTempReturnElimination(nodeRecord.body as MutableGameMakerAstNode);
    }

    if (statement.type === "IfStatement") {
        if (Core.isObjectLike(statement.consequent)) {
            visitStatementChildrenForTempReturnElimination(statement.consequent as MutableGameMakerAstNode);
        }
        if (Core.isObjectLike(statement.alternate)) {
            visitStatementChildrenForTempReturnElimination(statement.alternate as MutableGameMakerAstNode);
        }
    }

    if (Array.isArray(statement.cases)) {
        for (const caseNode of statement.cases) {
            if (!Core.isObjectLike(caseNode)) {
                continue;
            }

            visitStatementChildrenForTempReturnElimination(caseNode as MutableGameMakerAstNode);
            if (Array.isArray((caseNode as MutableAstRecord).body)) {
                processStatementListForTempReturnElimination((caseNode as MutableAstRecord).body as StatementList);
            }
        }
    }
}

function maybeBuildRedundantTempReturnReplacement(
    declarationStatement: MutableGameMakerAstNode | null | undefined,
    returnStatement: MutableGameMakerAstNode | null | undefined
): MutableGameMakerAstNode | null {
    if (!Core.isObjectLike(declarationStatement) || !Core.isObjectLike(returnStatement)) {
        return null;
    }

    if (declarationStatement.type !== "VariableDeclaration" || returnStatement.type !== "ReturnStatement") {
        return null;
    }

    if (Core.hasComment(declarationStatement) || Core.hasComment(returnStatement)) {
        return null;
    }

    const declarations = Core.asArray<MutableAstRecord>((declarationStatement as MutableAstRecord).declarations);
    if (declarations.length !== 1) {
        return null;
    }

    const declarator = declarations[0];
    if (!Core.isObjectLike(declarator) || declarator.type !== "VariableDeclarator") {
        return null;
    }

    const temporaryName = Core.getIdentifierText(declarator.id);
    const initializer = declarator.init as MutableGameMakerAstNode | null | undefined;
    if (!temporaryName || !initializer || Core.hasComment(initializer)) {
        return null;
    }

    const returnArgument = (returnStatement as MutableAstRecord).argument as MutableGameMakerAstNode | null | undefined;
    if (
        !returnArgument ||
        Core.getIdentifierText(returnArgument) !== temporaryName ||
        Core.hasComment(returnArgument)
    ) {
        return null;
    }

    return {
        type: "ReturnStatement",
        argument: Core.cloneAstNode(initializer),
        start: Core.cloneLocation(declarationStatement.start),
        end: Core.cloneLocation(returnStatement.end)
    } as MutableGameMakerAstNode;
}

function optimizeConditionalMemberAccessCaching(ast: MutableGameMakerAstNode): void {
    const body = Array.isArray((ast as MutableAstRecord).body)
        ? ((ast as MutableAstRecord).body as StatementList)
        : null;
    if (!body) {
        return;
    }

    processStatementListForMemberCaching(body);
}

function processStatementListForMemberCaching(statements: StatementList): void {
    if (!Array.isArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        let statement = statements[index];
        if (!Core.isObjectLike(statement)) {
            continue;
        }

        let insertionOffset = 0;

        if (statement.type === "IfStatement") {
            insertionOffset += maybeCacheRepeatedMemberAccessForIfStatement(
                statement,
                statements,
                index + insertionOffset
            );
        }

        if (isLoopStatement(statement)) {
            insertionOffset += maybeHoistInvariantLoopCondition(statement, statements, index + insertionOffset);
        }

        if (insertionOffset > 0) {
            index += insertionOffset;
            statement = statements[index];
            if (!Core.isObjectLike(statement)) {
                continue;
            }
        }

        visitStatementChildrenForMemberCaching(statement);
    }
}

function visitStatementChildrenForMemberCaching(statement: MutableGameMakerAstNode): void {
    const nodeRecord = statement as MutableAstRecord;

    if (Array.isArray(nodeRecord.body)) {
        processStatementListForMemberCaching(nodeRecord.body as StatementList);
    } else if (Core.isObjectLike(nodeRecord.body)) {
        visitStatementChildrenForMemberCaching(nodeRecord.body as MutableGameMakerAstNode);
    }

    if (statement.type === "IfStatement") {
        if (Core.isObjectLike(statement.consequent)) {
            visitStatementChildrenForMemberCaching(statement.consequent as MutableGameMakerAstNode);
        }
        if (Core.isObjectLike(statement.alternate)) {
            visitStatementChildrenForMemberCaching(statement.alternate as MutableGameMakerAstNode);
        }
    }

    if (Array.isArray(statement.cases)) {
        for (const caseNode of statement.cases) {
            if (!Core.isObjectLike(caseNode)) {
                continue;
            }

            visitStatementChildrenForMemberCaching(caseNode as MutableGameMakerAstNode);
            if (Array.isArray((caseNode as MutableAstRecord).body)) {
                processStatementListForMemberCaching((caseNode as MutableAstRecord).body as StatementList);
            }
        }
    }
}

function maybeCacheRepeatedMemberAccessForIfStatement(
    statement: MutableGameMakerAstNode,
    statements: StatementList,
    statementIndex: number
): number {
    if (!Core.isObjectLike(statement) || statement.type !== "IfStatement") {
        return 0;
    }

    if (Core.hasComment(statement) || Core.hasComment(statement.test) || !Core.isObjectLike(statement.test)) {
        return 0;
    }

    const occurrenceCounts = collectMemberAccessOccurrenceCounts(statement.test);

    let selectedPath = "";
    let selectedCount = 0;

    for (const [path, count] of occurrenceCounts) {
        if (count < 2) {
            continue;
        }

        if (count > selectedCount || (count === selectedCount && path.length > selectedPath.length)) {
            selectedPath = path;
            selectedCount = count;
        }
    }

    if (!selectedPath || selectedCount < 2) {
        return 0;
    }

    const usedNames = collectIdentifierNamesInStatements(statements);
    const cachedVariableName = createUniqueTemporaryName("__gml_cached_member", usedNames);

    const conditionRoot = { test: statement.test };
    const replacedCount = replaceMemberAccessPath(conditionRoot, "test", selectedPath, cachedVariableName);
    const nextTest = conditionRoot.test;

    if (replacedCount < 2 || !Core.isObjectLike(nextTest)) {
        return 0;
    }

    statement.test = nextTest as MutableGameMakerAstNode;

    const initializerNode = recreateMemberPathExpression(selectedPath, nextTest as MutableGameMakerAstNode);
    if (!initializerNode) {
        return 0;
    }

    const declaration = createCachedVariableDeclaration(cachedVariableName, initializerNode, statement.start);
    statements.splice(statementIndex, 0, declaration);
    return 1;
}

function maybeHoistInvariantLoopCondition(
    statement: MutableGameMakerAstNode,
    statements: StatementList,
    statementIndex: number
): number {
    if (!Core.isObjectLike(statement) || !isLoopStatement(statement)) {
        return 0;
    }

    const loopCondition = getLoopConditionExpression(statement);
    if (!loopCondition || Core.hasComment(statement) || Core.hasComment(loopCondition)) {
        return 0;
    }

    const loopBody = (statement as MutableAstRecord).body as unknown;
    if (containsCallExpression(loopBody)) {
        return 0;
    }

    const assignedIdentifiers = new Set<string>();
    collectAssignedIdentifiersFromNode(loopBody, assignedIdentifiers);

    if (statement.type === "ForStatement" && Core.isObjectLike(statement.update)) {
        collectAssignedIdentifiersFromNode(statement.update, assignedIdentifiers);
    }

    const occurrenceCounts = collectMemberAccessOccurrenceCounts(loopCondition);

    let selectedPath = "";

    for (const [path] of occurrenceCounts) {
        const rootIdentifier = path.split(".")[0];
        if (!rootIdentifier || assignedIdentifiers.has(rootIdentifier)) {
            continue;
        }

        if (path.length > selectedPath.length) {
            selectedPath = path;
        }
    }

    if (!selectedPath) {
        return 0;
    }

    const usedNames = collectIdentifierNamesInStatements(statements);
    const cachedVariableName = createUniqueTemporaryName("__gml_invariant_condition", usedNames);

    const conditionRecord = statement as MutableAstRecord;
    const conditionRoot = { test: conditionRecord.test };
    const replacedCount = replaceMemberAccessPath(conditionRoot, "test", selectedPath, cachedVariableName);
    const nextTest = conditionRoot.test;

    if (replacedCount === 0 || !Core.isObjectLike(nextTest)) {
        return 0;
    }

    conditionRecord.test = nextTest;

    const initializerNode = recreateMemberPathExpression(selectedPath, loopCondition);
    if (!initializerNode) {
        return 0;
    }

    const declaration = createCachedVariableDeclaration(cachedVariableName, initializerNode, statement.start);
    statements.splice(statementIndex, 0, declaration);
    return 1;
}

function collectMemberAccessOccurrenceCounts(root: unknown): Map<string, number> {
    const counts = new Map<string, number>();

    walkNode(root, null, null, (node, parent, property) => {
        const path = getMemberAccessPath(node);
        if (!path || !isCollectibleMemberAccessNode(node, parent, property)) {
            return;
        }

        const existing = counts.get(path) ?? 0;
        counts.set(path, existing + 1);
    });

    return counts;
}

function replaceMemberAccessPath(
    parentContainer: Record<string, unknown> | Array<unknown>,
    property: string,
    targetPath: string,
    replacementIdentifier: string
): number {
    if (!targetPath || !replacementIdentifier) {
        return 0;
    }

    return replaceMemberAccessPathInternal(parentContainer, property, targetPath, replacementIdentifier);
}

function replaceMemberAccessPathInternal(
    parentContainer: Record<string, unknown> | Array<unknown>,
    property: string | number,
    targetPath: string,
    replacementIdentifier: string
): number {
    let currentValue: unknown;
    if (Array.isArray(parentContainer)) {
        if (typeof property !== "number") {
            return 0;
        }
        currentValue = parentContainer[property];
    } else {
        if (typeof property !== "string") {
            return 0;
        }
        currentValue = parentContainer[property];
    }

    if (!Core.isObjectLike(currentValue)) {
        return 0;
    }

    if (
        !Array.isArray(currentValue) &&
        isCollectibleMemberAccessNode(currentValue, parentContainer, property) &&
        getMemberAccessPath(currentValue) === targetPath
    ) {
        const replacement = createIdentifierNode(replacementIdentifier, currentValue);
        parentContainer[property] = Array.isArray(parentContainer) ? replacement : replacement;
        return 1;
    }

    if (Array.isArray(currentValue)) {
        let replacements = 0;
        for (let index = 0; index < currentValue.length; index += 1) {
            replacements += replaceMemberAccessPathInternal(currentValue, index, targetPath, replacementIdentifier);
        }
        return replacements;
    }

    let replacements = 0;
    for (const [childKey, childValue] of Object.entries(currentValue)) {
        if (IGNORED_CHILD_KEYS.has(childKey) || !Core.isObjectLike(childValue)) {
            continue;
        }

        replacements += replaceMemberAccessPathInternal(
            currentValue as Record<string, unknown>,
            childKey,
            targetPath,
            replacementIdentifier
        );
    }

    return replacements;
}

function recreateMemberPathExpression(
    path: string,
    sourceNode: MutableGameMakerAstNode
): MutableGameMakerAstNode | null {
    const segments = path.split(".").filter((segment) => segment.length > 0);
    if (segments.length < 3) {
        return null;
    }

    let expression: MutableGameMakerAstNode = {
        type: "Identifier",
        name: segments[0],
        start: Core.cloneLocation(sourceNode.start),
        end: Core.cloneLocation(sourceNode.end)
    } as MutableGameMakerAstNode;

    for (let index = 1; index < segments.length; index += 1) {
        expression = {
            type: "MemberDotExpression",
            object: expression,
            property: {
                type: "Identifier",
                name: segments[index],
                start: Core.cloneLocation(sourceNode.start),
                end: Core.cloneLocation(sourceNode.end)
            },
            start: Core.cloneLocation(sourceNode.start),
            end: Core.cloneLocation(sourceNode.end)
        } as MutableGameMakerAstNode;
    }

    return expression;
}

function getMemberAccessPath(node: unknown): string | null {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    if ((node as MutableGameMakerAstNode).type === "Identifier") {
        return Core.getIdentifierText(node as MutableGameMakerAstNode);
    }

    if ((node as MutableGameMakerAstNode).type !== "MemberDotExpression") {
        return null;
    }

    const nodeRecord = node as MutableAstRecord;
    const objectPath = getMemberAccessPath(nodeRecord.object);
    const propertyName = Core.getIdentifierText(nodeRecord.property as MutableGameMakerAstNode);

    if (!objectPath || !propertyName) {
        return null;
    }

    return `${objectPath}.${propertyName}`;
}

function isCollectibleMemberAccessNode(
    node: unknown,
    parent: unknown,
    property: string | number | null
): node is MutableGameMakerAstNode {
    if (!Core.isObjectLike(node) || (node as MutableGameMakerAstNode).type !== "MemberDotExpression") {
        return false;
    }

    if (Core.hasComment(node as MutableGameMakerAstNode)) {
        return false;
    }

    if (
        Core.isObjectLike(parent) &&
        (parent as MutableGameMakerAstNode).type === "MemberDotExpression" &&
        property === "object"
    ) {
        return false;
    }

    const memberPath = getMemberAccessPath(node as MutableGameMakerAstNode);
    if (!memberPath) {
        return false;
    }

    return memberPath.split(".").length >= 3;
}

function createCachedVariableDeclaration(
    identifierName: string,
    initializer: MutableGameMakerAstNode,
    startLocation: unknown
): MutableGameMakerAstNode {
    return {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [
            {
                type: "VariableDeclarator",
                id: {
                    type: "Identifier",
                    name: identifierName
                },
                init: initializer
            }
        ],
        start: Core.cloneLocation(startLocation)
    } as MutableGameMakerAstNode;
}

function createIdentifierNode(identifierName: string, sourceNode: MutableGameMakerAstNode): MutableGameMakerAstNode {
    return {
        type: "Identifier",
        name: identifierName,
        start: Core.cloneLocation(sourceNode.start),
        end: Core.cloneLocation(sourceNode.end)
    } as MutableGameMakerAstNode;
}

function createUniqueTemporaryName(baseName: string, takenNames: Set<string>): string {
    if (!takenNames.has(baseName)) {
        takenNames.add(baseName);
        return baseName;
    }

    let suffix = 1;
    while (takenNames.has(`${baseName}_${suffix}`)) {
        suffix += 1;
    }

    const resolvedName = `${baseName}_${suffix}`;
    takenNames.add(resolvedName);
    return resolvedName;
}

function collectIdentifierNamesInStatements(statements: StatementList): Set<string> {
    const names = new Set<string>();

    for (const statement of statements) {
        collectIdentifierNamesInNode(statement, names);
    }

    return names;
}

function collectIdentifierNamesInNode(node: unknown, names: Set<string>): void {
    walkNode(node, null, null, (child) => {
        if (child.type !== "Identifier") {
            return;
        }

        const identifierName = Core.getIdentifierText(child);
        if (identifierName) {
            names.add(identifierName);
        }
    });
}

function collectAssignedIdentifiersFromNode(node: unknown, assignedIdentifiers: Set<string>): void {
    walkNode(node, null, null, (child) => {
        if (child.type === "VariableDeclarator") {
            collectAssignedIdentifiersFromTarget((child as MutableAstRecord).id, assignedIdentifiers);
            return;
        }

        if (child.type === "AssignmentExpression") {
            collectAssignedIdentifiersFromTarget((child as MutableAstRecord).left, assignedIdentifiers);
            return;
        }

        if (child.type === "IncDecExpression" || child.type === "IncDecStatement") {
            collectAssignedIdentifiersFromTarget((child as MutableAstRecord).argument, assignedIdentifiers);
        }
    });
}

function collectAssignedIdentifiersFromTarget(target: unknown, assignedIdentifiers: Set<string>): void {
    if (!Core.isObjectLike(target)) {
        return;
    }

    if ((target as MutableGameMakerAstNode).type === "Identifier") {
        const identifierName = Core.getIdentifierText(target as MutableGameMakerAstNode);
        if (identifierName) {
            assignedIdentifiers.add(identifierName);
        }
        return;
    }

    if ((target as MutableGameMakerAstNode).type === "MemberDotExpression") {
        collectAssignedIdentifiersFromTarget((target as MutableAstRecord).object, assignedIdentifiers);
        return;
    }

    if ((target as MutableGameMakerAstNode).type === "MemberIndexExpression") {
        collectAssignedIdentifiersFromTarget((target as MutableAstRecord).object, assignedIdentifiers);
        collectIdentifierNamesInNode((target as MutableAstRecord).property, assignedIdentifiers);
    }
}

function containsCallExpression(node: unknown): boolean {
    let hasCallExpression = false;

    walkNode(node, null, null, (child) => {
        if (child.type === "CallExpression") {
            hasCallExpression = true;
        }
    });

    return hasCallExpression;
}

function getLoopConditionExpression(loopNode: MutableGameMakerAstNode): MutableGameMakerAstNode | null {
    if (!isLoopStatement(loopNode)) {
        return null;
    }

    const testNode = (loopNode as MutableAstRecord).test;
    return Core.isObjectLike(testNode) ? (testNode as MutableGameMakerAstNode) : null;
}

function isLoopStatement(node: unknown): node is MutableGameMakerAstNode {
    if (!Core.isObjectLike(node) || typeof (node as MutableGameMakerAstNode).type !== "string") {
        return false;
    }

    switch ((node as MutableGameMakerAstNode).type) {
        case "ForStatement":
        case "WhileStatement":
        case "DoUntilStatement":
        case "DoWhileStatement":
        case "RepeatStatement": {
            return true;
        }
        default: {
            return false;
        }
    }
}

function walkNode(
    node: unknown,
    parent: unknown,
    property: string | number | null,
    callback: (node: MutableGameMakerAstNode, parent: unknown, property: string | number | null) => void
): void {
    if (!Core.isObjectLike(node)) {
        return;
    }

    if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index += 1) {
            walkNode(node[index], node, index, callback);
        }
        return;
    }

    const astNode = node as MutableGameMakerAstNode;
    callback(astNode, parent, property);

    for (const [childKey, childValue] of Object.entries(node)) {
        if (IGNORED_CHILD_KEYS.has(childKey) || !Core.isObjectLike(childValue)) {
            continue;
        }

        walkNode(childValue, node, childKey, callback);
    }
}

/** Pre-instantiated transform exposed for parser-normalization pipelines. */
export const optimizeLogicalExpressionsTransform = createParserTransform<OptimizeLogicalExpressionsOptions>(
    "optimize-logical-expressions",
    {},
    execute
);
