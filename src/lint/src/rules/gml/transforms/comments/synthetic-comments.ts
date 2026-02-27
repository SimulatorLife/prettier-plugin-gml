import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import {
    collectAdjacentLeadingSourceLineComments,
    collectLeadingProgramLineComments,
    collectSyntheticDocCommentLines,
    computeSyntheticFunctionDocLines,
    extractLeadingNonDocCommentLines,
    isDocLikeLeadingLine,
    mergeSyntheticDocComments,
    promoteLeadingDocCommentTextToDescription,
    reorderDescriptionLinesToTop
} from "../../../../doc-comment/index.js";

const STRING_TYPE = "string";

type SyntheticDocCommentResult = Readonly<{
    docLines: string[] | null;
    hasExistingDocLines: boolean;
    plainLeadingLines: string[];
}> | null;

type FunctionLikeSyntheticNode = MutableGameMakerAstNode & {
    type: "FunctionDeclaration" | "FunctionExpression" | "ConstructorDeclaration";
    id?: unknown;
    body?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFunctionLikeSyntheticNode(value: unknown): value is FunctionLikeSyntheticNode {
    if (!isObjectRecord(value)) {
        return false;
    }

    const nodeType = Reflect.get(value, "type");
    return (
        nodeType === "FunctionDeclaration" || nodeType === "FunctionExpression" || nodeType === "ConstructorDeclaration"
    );
}

function getIdentifierNodeName(value: unknown): string | null {
    if (!isObjectRecord(value)) {
        return null;
    }

    if (Reflect.get(value, "type") !== "Identifier") {
        return null;
    }

    const name = Reflect.get(value, "name");
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    return name;
}

function processLeadingCommentLines(
    targetNode: MutableGameMakerAstNode,
    functionNode: MutableGameMakerAstNode,
    options: Record<string, unknown>,
    programNode: MutableGameMakerAstNode,
    sourceText: string | null
): {
    existingDocLines: string[];
    docLikeLeadingLines: string[];
    plainLeadingLines: string[];
} | null {
    const hasFunctionDoc = Core.isNonEmptyArray((functionNode as { docComments?: unknown[] }).docComments);

    const { existingDocLines, remainingComments } = collectSyntheticDocCommentLines(
        targetNode,
        options,
        programNode,
        sourceText
    );
    const { leadingLines: leadingCommentLines, remainingComments: updatedComments } = extractLeadingNonDocCommentLines(
        remainingComments,
        options
    );

    const sourceLeadingLines =
        existingDocLines.length === 0 ? collectAdjacentLeadingSourceLineComments(targetNode, options, sourceText) : [];
    const programLeadingLines = collectLeadingProgramLineComments(targetNode, programNode, options, sourceText);
    const combinedLeadingLines = [...programLeadingLines, ...sourceLeadingLines, ...leadingCommentLines];
    const docLikeLeadingLines: string[] = [];
    const plainLeadingLines: string[] = [];
    for (const line of combinedLeadingLines) {
        if (isDocLikeLeadingLine(line)) {
            docLikeLeadingLines.push(line);
        } else {
            plainLeadingLines.push(line);
        }
    }

    if (existingDocLines.length > 0 || combinedLeadingLines.length > 0) {
        (targetNode as { comments?: unknown[] }).comments = updatedComments;
    }

    if (hasFunctionDoc && existingDocLines.length === 0 && docLikeLeadingLines.length === 0) {
        return null;
    }

    return {
        existingDocLines,
        docLikeLeadingLines,
        plainLeadingLines
    };
}

function suppressConstructorAssignmentPadding(functionNode: MutableGameMakerAstNode): void {
    if (!functionNode || functionNode.type !== "ConstructorDeclaration") {
        return;
    }

    const bodyNode = functionNode.body;
    if (!isObjectRecord(bodyNode)) {
        return;
    }

    const bodyNodeType = Reflect.get(bodyNode, "type");
    const bodyStatements = Reflect.get(bodyNode, "body");
    if (bodyNodeType !== "BlockStatement" || !Array.isArray(bodyStatements)) {
        return;
    }

    for (const statement of bodyStatements) {
        if (!isObjectRecord(statement)) {
            continue;
        }

        const statementNode = statement as MutableGameMakerAstNode;

        if (Core.hasComment(statementNode)) {
            break;
        }

        if (statementNode.type === "AssignmentExpression") {
            statementNode._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        if (statementNode.type === "VariableDeclaration" && statementNode.kind !== "static") {
            statementNode._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        break;
    }
}

function computeSyntheticDocComment(
    functionNode: MutableGameMakerAstNode,
    existingDocLines: string[],
    options: Record<string, unknown>,
    overrides: Record<string, unknown> = {}
): {
    docLines: string[];
    hasExistingDocLines: boolean;
} | null {
    const docCommentOptions = { ...options };

    const hasExistingDocLines = existingDocLines.length > 0;

    let syntheticLines = hasExistingDocLines
        ? mergeSyntheticDocComments(functionNode, existingDocLines, docCommentOptions, overrides)
        : reorderDescriptionLinesToTop(computeSyntheticFunctionDocLines(functionNode, [], options, overrides));

    if (hasExistingDocLines && syntheticLines.length > 0) {
        syntheticLines = syntheticLines.filter((line) => {
            if (typeof line !== STRING_TYPE) {
                return true;
            }
            const trimmed = line.trim();
            return !/^\/\/\/\s*@(?:function|func)\b/i.test(trimmed);
        });
    }

    const leadingCommentLines = Array.isArray(overrides.leadingCommentLines)
        ? overrides.leadingCommentLines
              .map((line) => (typeof line === STRING_TYPE ? line : null))
              .filter((line): line is string => Core.isNonEmptyTrimmedString(line))
        : [];

    if (syntheticLines.length === 0 && leadingCommentLines.length === 0) {
        return null;
    }

    const potentiallyPromotableLines =
        leadingCommentLines.length > 0 && syntheticLines.length > 0
            ? promoteLeadingDocCommentTextToDescription([...leadingCommentLines, syntheticLines[0]]).slice(
                  0,
                  leadingCommentLines.length
              )
            : leadingCommentLines;

    const hasPromotedDescription = potentiallyPromotableLines.some(
        (line) => typeof line === STRING_TYPE && /^\/\/\/\s*@description\b/i.test(line.trim())
    );

    const docLines =
        leadingCommentLines.length === 0
            ? syntheticLines
            : hasPromotedDescription
              ? [...syntheticLines, ...potentiallyPromotableLines]
              : [...potentiallyPromotableLines, ...(syntheticLines.length > 0 ? ["", ...syntheticLines] : [])];

    const normalizedDocLines = Core.toMutableArray(docLines);

    return {
        docLines: normalizedDocLines,
        hasExistingDocLines
    };
}

export function computeSyntheticDocCommentForStaticVariable(
    node: MutableGameMakerAstNode,
    options: Record<string, unknown>,
    programNode: MutableGameMakerAstNode,
    sourceText: string | null
): SyntheticDocCommentResult {
    if (!node || node.type !== "VariableDeclaration" || node.kind !== "static") {
        return null;
    }

    const declarator = Core.getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (
        !isFunctionLikeSyntheticNode(declarator.init) ||
        (declarator.init.type !== "FunctionDeclaration" && declarator.init.type !== "FunctionExpression")
    ) {
        return null;
    }

    const functionNode = declarator.init;
    const processedComments = processLeadingCommentLines(node, functionNode, options, programNode, sourceText);
    if (!processedComments) {
        return null;
    }

    const { existingDocLines, docLikeLeadingLines, plainLeadingLines } = processedComments;

    const syntheticOverrides: Record<string, unknown> = { nameOverride: declarator.id.name };
    if (node._overridesStaticFunction === true) {
        syntheticOverrides.includeOverrideTag = true;
    }

    if (docLikeLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = docLikeLeadingLines;
    }

    const syntheticDoc = computeSyntheticDocComment(functionNode, existingDocLines, options, syntheticOverrides);

    if (!syntheticDoc && plainLeadingLines.length === 0) {
        return null;
    }

    let finalDocLines = syntheticDoc?.docLines === undefined ? null : Core.toMutableArray(syntheticDoc.docLines);

    if (node._overridesStaticFunction === true && node._overridesStaticFunctionNode) {
        const overrideNode = node._overridesStaticFunctionNode as { _syntheticDocLines?: unknown } | null;
        const ancestorDocLines = overrideNode?._syntheticDocLines;

        if (Array.isArray(ancestorDocLines) && ancestorDocLines.every((line) => typeof line === STRING_TYPE)) {
            finalDocLines = ["/// @override", ...ancestorDocLines];
        }
    }

    if (finalDocLines) {
        node._syntheticDocLines = finalDocLines;
    } else {
        delete node._syntheticDocLines;
    }

    return {
        docLines: finalDocLines,
        hasExistingDocLines: syntheticDoc?.hasExistingDocLines === true,
        plainLeadingLines
    };
}

export function computeSyntheticDocCommentForFunctionAssignment(
    node: MutableGameMakerAstNode,
    options: Record<string, unknown>,
    programNode: MutableGameMakerAstNode,
    sourceText: string | null
): SyntheticDocCommentResult {
    if (!node) {
        return null;
    }

    let assignment: MutableGameMakerAstNode | null;
    const commentTarget = node;

    switch (node.type) {
        case "ExpressionStatement": {
            assignment = node.expression as MutableGameMakerAstNode;
            break;
        }
        case "AssignmentExpression": {
            assignment = node;
            break;
        }
        case "VariableDeclaration": {
            if (!Array.isArray(node.declarations) || node.declarations.length !== 1) {
                return null;
            }
            assignment = node.declarations[0] as MutableGameMakerAstNode;
            break;
        }
        default: {
            return null;
        }
    }

    const isDeclarator = assignment?.type === "VariableDeclarator";
    const operator = isDeclarator ? "=" : assignment?.operator;
    const left = isDeclarator ? assignment.id : assignment?.left;
    const functionNode = isDeclarator ? assignment.init : assignment?.right;
    const leftName = getIdentifierNodeName(left);

    if (
        !assignment ||
        (assignment.type !== "AssignmentExpression" && assignment.type !== "VariableDeclarator") ||
        operator !== "=" ||
        leftName === null
    ) {
        return null;
    }

    if (!isFunctionLikeSyntheticNode(functionNode)) {
        return null;
    }

    suppressConstructorAssignmentPadding(functionNode);

    const processedComments = processLeadingCommentLines(commentTarget, functionNode, options, programNode, sourceText);
    if (!processedComments) {
        return null;
    }

    const { existingDocLines, docLikeLeadingLines, plainLeadingLines } = processedComments;

    if (
        node.type === "VariableDeclaration" &&
        node.kind !== "static" &&
        (functionNode.type === "FunctionExpression" || functionNode.type === "FunctionDeclaration") &&
        !functionNode.id &&
        existingDocLines.length === 0
    ) {
        return null;
    }

    const syntheticOverrides: Record<string, unknown> = { nameOverride: leftName };

    if (docLikeLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = docLikeLeadingLines;
    }

    if (existingDocLines.length > 0) {
        syntheticOverrides.preserveDocCommentParamNames = true;
    }

    const syntheticDoc = computeSyntheticDocComment(functionNode, existingDocLines, options, syntheticOverrides);

    if (!syntheticDoc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        docLines: syntheticDoc?.docLines ?? null,
        hasExistingDocLines: syntheticDoc?.hasExistingDocLines === true,
        plainLeadingLines
    };
}
