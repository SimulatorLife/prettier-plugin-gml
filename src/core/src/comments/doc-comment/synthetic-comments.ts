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
    reorderDescriptionLinesAfterFunction,
    resolveDocCommentWrapWidth
} from "./service/index.js";
import { toMutableArray } from "../../utils/array.js";
import { isNonEmptyTrimmedString } from "../../utils/string.js";

const STRING_TYPE = "string";

function processLeadingCommentLines(
    targetNode,
    functionNode,
    options,
    programNode,
    sourceText
) {
    const hasFunctionDoc =
        Array.isArray(functionNode.docComments) &&
        functionNode.docComments.length > 0;

    const { existingDocLines, remainingComments } =
        collectSyntheticDocCommentLines(
            targetNode,
            options,
            programNode,
            sourceText
        );
    const {
        leadingLines: leadingCommentLines,
        remainingComments: updatedComments
    } = extractLeadingNonDocCommentLines(remainingComments, options);

    const sourceLeadingLines =
        existingDocLines.length === 0
            ? collectAdjacentLeadingSourceLineComments(
                  targetNode,
                  options,
                  sourceText
              )
            : [];
    const programLeadingLines = collectLeadingProgramLineComments(
        targetNode,
        programNode,
        options,
        sourceText
    );
    const combinedLeadingLines = [
        ...programLeadingLines,
        ...sourceLeadingLines,
        ...leadingCommentLines
    ];
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

    if (
        hasFunctionDoc &&
        existingDocLines.length === 0 &&
        docLikeLeadingLines.length === 0
    ) {
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

        if (
            statement.type === "VariableDeclaration" &&
            statement.kind !== "static"
        ) {
            statement._gmlSuppressFollowingEmptyLine = true;
            continue;
        }

        break;
    }
}

export function computeSyntheticDocComment(
    functionNode,
    existingDocLines,
    options,
    overrides: any = {}
) {
    // Use Core's resolution logic instead of the printer's
    const docCommentOptions = {
        ...options,
        docCommentMaxWrapWidth: resolveDocCommentWrapWidth(options)
    };

    const hasExistingDocLines = existingDocLines.length > 0;

    const syntheticLines = hasExistingDocLines
        ? mergeSyntheticDocComments(
              functionNode,
              existingDocLines,
              docCommentOptions,
              overrides
          )
        : reorderDescriptionLinesAfterFunction(
              computeSyntheticFunctionDocLines(
                  functionNode,
                  [],
                  options,
                  overrides
              )
          );

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
            ? promoteLeadingDocCommentTextToDescription([
                  ...leadingCommentLines,
                  syntheticLines[0]
              ]).slice(0, leadingCommentLines.length) // Take only the part corresponding to leadingCommentLines
            : leadingCommentLines;

    const docLines =
        leadingCommentLines.length === 0
            ? syntheticLines
            : [
                  ...potentiallyPromotableLines,
                  ...(syntheticLines.length > 0 ? ["", ...syntheticLines] : [])
              ];

    const normalizedDocLines = toMutableArray(docLines) as string[];

    return {
        docLines: normalizedDocLines,
        hasExistingDocLines
    };
}

export function computeSyntheticDocCommentForStaticVariable(
    node,
    options,
    programNode,
    sourceText
) {
    if (
        !node ||
        node.type !== "VariableDeclaration" ||
        node.kind !== "static"
    ) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);
    if (!declarator || declarator.id?.type !== "Identifier") {
        return null;
    }

    if (declarator.init?.type !== "FunctionDeclaration") {
        return null;
    }

    const functionNode = declarator.init;
    const processedComments = processLeadingCommentLines(
        node,
        functionNode,
        options,
        programNode,
        sourceText
    );

    if (!processedComments) {
        return null;
    }

    const { existingDocLines, docLikeLeadingLines, plainLeadingLines } =
        processedComments;

    const name = declarator.id.name;
    const syntheticOverrides: any = { nameOverride: name };
    if (node._overridesStaticFunction === true) {
        syntheticOverrides.includeOverrideTag = true;
    }

    if (docLikeLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = docLikeLeadingLines;
    }

    const syntheticDoc = computeSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );

    if (!syntheticDoc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        docLines: syntheticDoc?.docLines ?? null,
        hasExistingDocLines: syntheticDoc?.hasExistingDocLines === true,
        plainLeadingLines
    };
}

export function computeSyntheticDocCommentForFunctionAssignment(
    node,
    options,
    programNode,
    sourceText
) {
    if (!node) {
        return null;
    }

    let assignment;
    const commentTarget = node;

    if (node.type === "ExpressionStatement") {
        assignment = node.expression;
    } else if (node.type === "AssignmentExpression") {
        assignment = node;
    } else {
        return null;
    }

    if (
        !assignment ||
        assignment.type !== "AssignmentExpression" ||
        assignment.operator !== "=" ||
        assignment.left?.type !== "Identifier" ||
        typeof assignment.left.name !== STRING_TYPE
    ) {
        return null;
    }

    const functionNode = assignment.right;
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "FunctionExpression" &&
            functionNode.type !== "ConstructorDeclaration")
    ) {
        return null;
    }

    suppressConstructorAssignmentPadding(functionNode);

    const processedComments = processLeadingCommentLines(
        commentTarget,
        functionNode,
        options,
        programNode,
        sourceText
    );

    if (!processedComments) {
        return null;
    }

    const { existingDocLines, docLikeLeadingLines, plainLeadingLines } =
        processedComments;

    const name = assignment.left.name;
    const syntheticOverrides: any = { nameOverride: name };

    if (docLikeLeadingLines.length > 0) {
        syntheticOverrides.leadingCommentLines = docLikeLeadingLines;
    }

    const syntheticDoc = computeSyntheticDocComment(
        functionNode,
        existingDocLines,
        options,
        syntheticOverrides
    );

    if (!syntheticDoc && plainLeadingLines.length === 0) {
        return null;
    }

    return {
        docLines: syntheticDoc?.docLines ?? null,
        hasExistingDocLines: syntheticDoc?.hasExistingDocLines === true,
        plainLeadingLines
    };
}
