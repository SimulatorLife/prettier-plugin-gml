import { getSingleVariableDeclarator } from "../../ast/node-helpers.js";
import { hasComment } from "../comment-utils.js";
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
} from "./service/index.js";
import { isNonEmptyArray, isNonEmptyTrimmedString, toMutableArray } from "./utils.js";

const STRING_TYPE = "string";

function processLeadingCommentLines(
    targetNode: any,
    functionNode: any,
    options: any,
    programNode: any,
    sourceText: string | null
): {
    existingDocLines: string[];
    docLikeLeadingLines: string[];
    plainLeadingLines: string[];
} | null {
    const hasFunctionDoc = Array.isArray(functionNode.docComments) && functionNode.docComments.length > 0;

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
    const docLikeLeadingLines = [];
    const plainLeadingLines = [];
    for (const line of combinedLeadingLines) {
        if (isDocLikeLeadingLine(line)) {
            docLikeLeadingLines.push(line);
        } else {
            plainLeadingLines.push(line);
        }
    }

    if (existingDocLines.length > 0 || combinedLeadingLines.length > 0) {
        targetNode.comments = updatedComments;
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

export function suppressConstructorAssignmentPadding(functionNode) {
    if (
        !functionNode ||
        functionNode.type !== "ConstructorDeclaration" ||
        functionNode.body?.type !== "BlockStatement" ||
        !Array.isArray(functionNode.body.body)
    ) {
        return;
    }

    for (const statement of functionNode.body.body) {
        if (!statement) {
            continue;
        }

        if (hasComment(statement)) {
            break;
        }

        if (statement.type === "AssignmentExpression") {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        if (statement.type === "VariableDeclaration" && statement.kind !== "static") {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        break;
    }
}

export function computeSyntheticDocComment(functionNode, existingDocLines, options, overrides: any = {}) {
    const docCommentOptions = { ...options };

    const hasExistingDocLines = existingDocLines.length > 0;

    const syntheticLines = hasExistingDocLines
        ? mergeSyntheticDocComments(functionNode, existingDocLines, docCommentOptions, overrides)
        : reorderDescriptionLinesToTop(computeSyntheticFunctionDocLines(functionNode, [], options, overrides));

    const leadingCommentLines = Array.isArray(overrides?.leadingCommentLines)
        ? overrides.leadingCommentLines
              .map((line) => (typeof line === STRING_TYPE ? line : null))
              .filter((line) => isNonEmptyTrimmedString(line))
        : [];

    if (syntheticLines.length === 0 && leadingCommentLines.length === 0) {
        return null;
    }

    // Apply doc comment promotion to the combined lines if both leading comments and synthetic lines exist
    // This enables cases where possible-doc-like comments (// / or /// without @) appear before actual doc comments (@param, @function, etc.)
    // Cases where with `// /` need to be evaluated carefully as they may represent malformed doc-comments OR malformed normal comments
    const potentiallyPromotableLines =
        leadingCommentLines.length > 0 && syntheticLines.length > 0
            ? promoteLeadingDocCommentTextToDescription([...leadingCommentLines, syntheticLines[0]]).slice(
                  0,
                  leadingCommentLines.length
              ) // Take only the part corresponding to leadingCommentLines
            : leadingCommentLines;

    // Check if promotion created @description metadata
    const hasPromotedDescription = potentiallyPromotableLines.some(
        (line) => typeof line === STRING_TYPE && /^\/\/\/\s*@description\b/i.test(line.trim())
    );

    const docLines =
        leadingCommentLines.length === 0
            ? syntheticLines
            : hasPromotedDescription
              ? [
                    // When description is promoted, merge without blank line
                    // because @description should be part of the same doc block
                    ...syntheticLines,
                    ...potentiallyPromotableLines
                ]
              : [...potentiallyPromotableLines, ...(syntheticLines.length > 0 ? ["", ...syntheticLines] : [])];

    const normalizedDocLines = toMutableArray(docLines) as string[];

    return {
        docLines: normalizedDocLines,
        hasExistingDocLines
    };
}

export function computeSyntheticDocCommentForStaticVariable(node, options, programNode, sourceText) {
    if (!node || node.type !== "VariableDeclaration" || node.kind !== "static") {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (declarator.init?.type !== "FunctionDeclaration" && declarator.init?.type !== "FunctionExpression") {
        return null;
    }

    const functionNode = declarator.init;
    const processedComments = processLeadingCommentLines(node, functionNode, options, programNode, sourceText);

    if (!processedComments) {
        return null;
    }

    const { existingDocLines, docLikeLeadingLines, plainLeadingLines } = processedComments;

    const name = declarator.id.name;
    const syntheticOverrides: any = { nameOverride: name };
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

    let finalDocLines = syntheticDoc?.docLines === undefined ? null : toMutableArray(syntheticDoc.docLines);

    if (node._overridesStaticFunction === true && node._overridesStaticFunctionNode) {
        const ancestorDocLines = node._overridesStaticFunctionNode
            ? node._overridesStaticFunctionNode._syntheticDocLines
            : null;

        if (isNonEmptyArray(ancestorDocLines)) {
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

export function computeSyntheticDocCommentForFunctionAssignment(node, options, programNode, sourceText) {
    if (!node) {
        return null;
    }

    let assignment;
    const commentTarget = node;

    switch (node.type) {
        case "ExpressionStatement": {
            assignment = node.expression;

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
            assignment = node.declarations[0];

            break;
        }
        default: {
            return null;
        }
    }

    const isDeclarator = assignment?.type === "VariableDeclarator";
    const operator = isDeclarator ? "=" : assignment?.operator;
    const left = isDeclarator ? assignment.id : assignment.left;
    const functionNode = isDeclarator ? assignment.init : assignment?.right;

    if (
        !assignment ||
        (assignment.type !== "AssignmentExpression" && assignment.type !== "VariableDeclarator") ||
        operator !== "=" ||
        left?.type !== "Identifier" ||
        typeof left.name !== STRING_TYPE
    ) {
        return null;
    }
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "FunctionExpression" &&
            functionNode.type !== "ConstructorDeclaration")
    ) {
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

    const name = left.name;
    const syntheticOverrides: any = { nameOverride: name };

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
