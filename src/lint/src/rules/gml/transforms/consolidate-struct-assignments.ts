/**
 * Attempts to coalesce standalone struct assignments into their declaration site so that formatting can emit concise object literals.
 * The transform tracks moved comments and ensures no semantic data is lost while shifting property initializers.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import { AssignmentCommentHandler } from "./consolidate-struct-assignment-comment-handler.js";
import { type AssignmentDetails, StructAssignmentMatcher } from "./consolidate-struct-assignment-matcher.js";
import { createParserTransform } from "./functional-transform.js";
import { CommentTracker } from "./utils/comment-tracker.js";

type CommentTools = {
    addTrailingComment: (...args: Array<unknown>) => unknown;
};

type ConsolidateStructAssignmentsTransformOptions = {
    commentTools?: CommentTools | null;
};

// Avoid destructuring Core across package boundaries; call Core.* functions
// directly. This prevents assumptions about nested namespaces and matches
// the monorepo conventions in AGENTS.md.

const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";

const FALLBACK_COMMENT_TOOLS = Object.freeze({
    addTrailingComment() {}
});

function normalizeCommentTools(commentTools) {
    if (!commentTools || typeof commentTools.addTrailingComment !== "function") {
        return FALLBACK_COMMENT_TOOLS;
    }

    return commentTools;
}

const COMMENT_SNAPSHOT_KEYS = [
    "enclosingNode",
    "precedingNode",
    "followingNode",
    "leading",
    "trailing",
    "placement",
    "leadingChar",
    "_structPropertyTrailing",
    "_structPropertyHandled",
    "_removedByConsolidation"
];

function snapshotComment(comment) {
    const snapshot = Object.create(null) as Record<string, { hadKey: boolean; value: unknown }>;
    for (const key of COMMENT_SNAPSHOT_KEYS) {
        snapshot[key] = {
            hadKey: Object.hasOwn(comment, key),
            value: comment[key]
        };
    }
    return snapshot;
}

function restoreComment(comment, snapshot) {
    for (const key of COMMENT_SNAPSHOT_KEYS) {
        const entry = snapshot[key];
        if (!entry) {
            continue;
        }

        if (!entry.hadKey) {
            delete comment[key];
            continue;
        }

        comment[key] = entry.value;
    }
}

type PropertyKeyInfo = {
    identifierName: string;
    raw: unknown;
    start: unknown;
    end: unknown;
};

function getPropertyKeyInfo(propertyNode: unknown): PropertyKeyInfo | null {
    if (!Core.isNode(propertyNode)) {
        return null;
    }

    if (Core.isIdentifierNode(propertyNode)) {
        return {
            identifierName: propertyNode.name,
            raw: propertyNode.name,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    if (Core.isLiteralNode(propertyNode) && typeof propertyNode.value === "string") {
        const unquoted = Core.stripStringQuotes(propertyNode.value as any);
        return {
            identifierName: unquoted,
            raw: propertyNode.value,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    return null;
}

function buildPropertyNameNode(
    propertyKey: PropertyKeyInfo | null,
    isIdentifierSafe: (name: unknown) => boolean
): unknown {
    if (!propertyKey) {
        return null;
    }

    const identifierName = propertyKey.identifierName;
    if (identifierName && isIdentifierSafe(identifierName)) {
        return {
            type: IDENTIFIER,
            name: identifierName,
            start: Core.cloneLocation(propertyKey.start) ?? null,
            end: Core.cloneLocation(propertyKey.end) ?? null
        };
    }

    if (typeof propertyKey.raw === "string") {
        return {
            type: LITERAL,
            value: propertyKey.raw,
            start: Core.cloneLocation(propertyKey.start) ?? null,
            end: Core.cloneLocation(propertyKey.end) ?? null
        };
    }

    return null;
}

function getPreferredLocation(primary: unknown, fallback: unknown): unknown {
    if (Core.isNode(primary)) {
        return primary;
    }
    if (Core.isNode(fallback)) {
        return fallback;
    }
    return null;
}

function buildPropertyFromAssignment(
    assignmentDetails: AssignmentDetails | null,
    isIdentifierSafe: (name: unknown) => boolean
): MutableGameMakerAstNode | null {
    if (!assignmentDetails) {
        return null;
    }

    const { assignment, propertyAccess } = assignmentDetails;
    if (!Core.isNode(assignment) || assignment.type !== ASSIGNMENT_EXPRESSION) {
        return null;
    }

    if (!propertyAccess) {
        return null;
    }

    const propertyKey = getPropertyKeyInfo(propertyAccess.propertyNode);
    const propertyName = buildPropertyNameNode(propertyKey, isIdentifierSafe);
    if (!propertyName) {
        return null;
    }

    return {
        type: "Property",
        name: propertyName,
        value: assignment.right,
        start: Core.cloneLocation(getPreferredLocation(propertyAccess.propertyStart, assignment.start)) ?? null,
        end: Core.cloneLocation(getPreferredLocation(assignment.right?.end, assignment.end)) ?? null
    } as unknown as MutableGameMakerAstNode;
}

/**
 * Recursive visitor that tries to gather struct property assignments after their initializer for consolidation.
 */
function visit(
    node,
    tracker,
    commentTools,
    matcher: StructAssignmentMatcher,
    commentHandler: AssignmentCommentHandler
) {
    if (!Core.isNode(node)) {
        return;
    }

    if (Array.isArray(node)) {
        // Snapshot the array before iteration to avoid traversal hazards.
        // If a visited child mutates the original array (e.g., by removing or
        // adding elements), the iteration would skip or revisit elements. The
        // snapshot ensures each element is visited exactly once.
        const snapshot = [...node];
        for (const item of snapshot) {
            visit(item, tracker, commentTools, matcher, commentHandler);
        }
        return;
    }

    if (Array.isArray(node.body)) {
        consolidateBlock(node.body, tracker, commentTools, matcher, commentHandler);
        // Snapshot the body array before iteration to avoid traversal hazards.
        // consolidateBlock mutates node.body by splicing out consolidated property
        // assignments, so we iterate over a copy to ensure all remaining children
        // (after consolidation) are visited exactly once.
        const bodySnapshot = [...node.body];
        for (const child of bodySnapshot) {
            visit(child, tracker, commentTools, matcher, commentHandler);
        }
    } else if (Core.isNode(node.body)) {
        visit(node.body, tracker, commentTools, matcher, commentHandler);
    }

    Core.forEachNodeChild(node, (value, key) => {
        if (key === "body" || key === "start" || key === "end" || key === "comments") {
            return;
        }
        visit(value, tracker, commentTools, matcher, commentHandler);
    });
}

/**
 * Scan sequential statements for a struct initializer and pull following member assignments into it.
 */
function consolidateBlock(
    statements,
    tracker,
    commentTools,
    matcher: StructAssignmentMatcher,
    commentHandler: AssignmentCommentHandler
) {
    if (!Core.isNonEmptyArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index++) {
        const initializer = matcher.getStructInitializer(statements[index]);
        if (!initializer) {
            continue;
        }

        const { identifierName, structNode } = initializer;
        const structEndIndex = Core.getNodeEndIndex(structNode);
        if (structEndIndex === undefined) {
            continue;
        }

        const initializerStart = Core.getNodeStartIndex(statements[index]);
        const initializerEnd = Core.getNodeEndIndex(statements[index]);
        if (tracker.hasBetween(initializerStart, initializerEnd)) {
            continue;
        }

        const collected = collectPropertyAssignments({
            statements,
            startIndex: index + 1,
            identifierName,
            previousEnd: structEndIndex,
            tracker,
            commentTools,
            matcher,
            commentHandler
        });

        if (!collected) {
            continue;
        }

        // The collected properties are assigned to the struct node, mutating
        // it in-place for downstream transforms.
        structNode.properties = collected.properties;
        structNode.hasTrailingComma = collected.shouldForceBreak;

        statements.splice(index + 1, collected.count);
    }
}

function collectPropertyAssignments({
    statements,
    startIndex,
    identifierName,
    previousEnd,
    tracker,
    commentTools,
    matcher,
    commentHandler
}) {
    tracker.checkpoint();
    const touchedComments = [];
    const properties = [];
    let cursor = startIndex;
    let lastEnd = previousEnd;
    let previousStatement = null;
    let lastProperty = null;

    while (cursor < statements.length) {
        const statement = statements[cursor];
        const assignmentDetails = matcher.getStructPropertyAssignmentDetails(statement, identifierName);
        if (!assignmentDetails) {
            break;
        }

        const start = Core.getNodeStartIndex(statement);
        const end = Core.getNodeEndIndex(statement);
        if (start === undefined || end === undefined) {
            break;
        }

        if (
            !commentHandler.allowTrailingCommentsBetween(
                tracker,
                lastEnd,
                start,
                previousStatement,
                lastProperty,
                commentTools
            )
        ) {
            break;
        }

        if (tracker.hasBetween(start, end)) {
            break;
        }

        const property = buildPropertyFromAssignment(assignmentDetails, matcher.isIdentifierSafe.bind(matcher));
        if (!property) {
            break;
        }

        const nextStatement = statements[cursor + 1];
        const nextStart = Core.getNodeStartIndex(nextStatement);
        const attachableComments = tracker.takeBetween(end, nextStart ?? Number.POSITIVE_INFINITY, (comment) =>
            commentHandler.isAttachableTrailingComment(comment, statement)
        );

        if (attachableComments.length > 0) {
            let trailingComments = Array.isArray(property._structTrailingComments)
                ? property._structTrailingComments
                : null;
            if (!trailingComments) {
                trailingComments = [];
                Object.defineProperty(property, "_structTrailingComments", {
                    value: trailingComments,
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            }
            for (const comment of attachableComments) {
                touchedComments.push({
                    comment,
                    snapshot: snapshotComment(comment)
                });
                comment.enclosingNode = property;
                comment.precedingNode = property;
                comment.followingNode = property;
                comment.leading = false;
                comment.trailing = false;
                comment.placement = "endOfLine";
                if (comment.leadingChar === ";") {
                    comment.leadingChar = ",";
                }
                comment._structPropertyTrailing = true;
                comment._structPropertyHandled = false;
                comment._removedByConsolidation = true;
                trailingComments.push(comment);
            }
            property._hasTrailingInlineComment = true;
            const lastComment = attachableComments.at(-1);
            const commentEnd = Core.getNodeEndIndex(lastComment);
            lastEnd = commentEnd === undefined ? end : commentEnd;
        } else {
            lastEnd = end;
        }

        properties.push(property);
        previousStatement = statement;
        lastProperty = property;
        cursor++;
    }

    if (properties.length === 0) {
        tracker.rollback();
        touchedComments.forEach(({ comment, snapshot }) => restoreComment(comment, snapshot));
        return null;
    }

    const nextStatement = statements[cursor];
    const nextBoundary = nextStatement ? Core.getNodeStartIndex(nextStatement) : Number.POSITIVE_INFINITY;

    if (
        !commentHandler.allowTrailingCommentsBetween(
            tracker,
            lastEnd,
            nextBoundary,
            previousStatement,
            lastProperty,
            commentTools
        )
    ) {
        tracker.rollback();
        touchedComments.forEach(({ comment, snapshot }) => restoreComment(comment, snapshot));
        return null;
    }

    if (!nextStatement && tracker.hasAfter(lastEnd)) {
        tracker.rollback();
        touchedComments.forEach(({ comment, snapshot }) => restoreComment(comment, snapshot));
        return null;
    }

    tracker.commit();

    const shouldForceBreak = properties.some((property) => property?._hasTrailingInlineComment);

    return {
        properties,
        count: properties.length,
        shouldForceBreak
    };
}

export const consolidateStructAssignmentsTransform =
    createParserTransform<ConsolidateStructAssignmentsTransformOptions>(
        "consolidate-struct-assignments",
        {} as ConsolidateStructAssignmentsTransformOptions,
        (
            ast: MutableGameMakerAstNode,
            options: ConsolidateStructAssignmentsTransformOptions
        ): MutableGameMakerAstNode => {
            if (!Core.isNode(ast)) {
                return ast;
            }
            const normalizedCommentTools = normalizeCommentTools(options.commentTools);
            const tracker = new CommentTracker(ast);
            const matcher = new StructAssignmentMatcher();
            const commentHandler = new AssignmentCommentHandler();

            visit(ast, tracker, normalizedCommentTools, matcher, commentHandler);

            tracker.removeConsumedComments();

            return ast;
        }
    );
