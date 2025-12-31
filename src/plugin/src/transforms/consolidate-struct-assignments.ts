/**
 * Attempts to coalesce standalone struct assignments into their declaration site so that formatting can emit concise object literals.
 * The transform tracks moved comments and ensures no semantic data is lost while shifting property initializers.
 */
import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { createParserTransform } from "./functional-transform.js";
import { CommentTracker } from "./utils/comment-tracker.js";
import {
    StructAssignmentMatcher,
    type AssignmentDetails
} from "./utils/struct-assignment-matcher.js";
import { AssignmentCommentHandler } from "./utils/assignment-comment-handler.js";

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
    if (
        !commentTools ||
        typeof commentTools.addTrailingComment !== "function"
    ) {
        return FALLBACK_COMMENT_TOOLS;
    }

    return commentTools;
}

function snapshotComment(comment) {
    return {
        enclosingNode: comment.enclosingNode,
        precedingNode: comment.precedingNode,
        followingNode: comment.followingNode,
        leading: comment.leading,
        trailing: comment.trailing,
        placement: comment.placement,
        leadingChar: comment.leadingChar,
        _structPropertyTrailing: comment._structPropertyTrailing,
        _structPropertyHandled: comment._structPropertyHandled,
        _removedByConsolidation: comment._removedByConsolidation
    };
}

function restoreComment(comment, snapshot) {
    comment.enclosingNode = snapshot.enclosingNode;
    comment.precedingNode = snapshot.precedingNode;
    comment.followingNode = snapshot.followingNode;
    comment.leading = snapshot.leading;
    comment.trailing = snapshot.trailing;
    comment.placement = snapshot.placement;
    comment.leadingChar = snapshot.leadingChar;

    if (snapshot._structPropertyTrailing === undefined) {
        delete comment._structPropertyTrailing;
    } else {
        comment._structPropertyTrailing = snapshot._structPropertyTrailing;
    }

    if (snapshot._structPropertyHandled === undefined) {
        delete comment._structPropertyHandled;
    } else {
        comment._structPropertyHandled = snapshot._structPropertyHandled;
    }

    if (snapshot._removedByConsolidation === undefined) {
        delete comment._removedByConsolidation;
    } else {
        comment._removedByConsolidation = snapshot._removedByConsolidation;
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

    if (
        Core.isLiteralNode(propertyNode) &&
        typeof propertyNode.value === "string"
    ) {
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
        start:
            Core.cloneLocation(
                getPreferredLocation(
                    propertyAccess.propertyStart,
                    assignment.start
                )
            ) ?? null,
        end:
            Core.cloneLocation(
                getPreferredLocation(assignment.right?.end, assignment.end)
            ) ?? null
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
        for (const item of node) {
            visit(item, tracker, commentTools, matcher, commentHandler);
        }
        return;
    }

    if (Array.isArray(node.body)) {
        consolidateBlock(node.body, tracker, commentTools, matcher, commentHandler);
        for (const child of node.body) {
            visit(child, tracker, commentTools, matcher, commentHandler);
        }
    } else if (Core.isNode(node.body)) {
        visit(node.body, tracker, commentTools, matcher, commentHandler);
    }

    Core.forEachNodeChild(node, (value, key) => {
        if (
            key === "body" ||
            key === "start" ||
            key === "end" ||
            key === "comments"
        ) {
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
        const initializer = matcher.getStructInitializer(
            statements[index]
        );
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
        const assignmentDetails =
            matcher.getStructPropertyAssignmentDetails(
                statement,
                identifierName
            );
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

        const property = buildPropertyFromAssignment(
            assignmentDetails,
            matcher.isIdentifierSafe.bind(matcher)
        );
        if (!property) {
            break;
        }

        const nextStatement = statements[cursor + 1];
        const nextStart = Core.getNodeStartIndex(nextStatement);
        const attachableComments = tracker.takeBetween(
            end,
            nextStart ?? Number.POSITIVE_INFINITY,
            (comment) =>
                commentHandler.isAttachableTrailingComment(
                    comment,
                    statement
                )
        );

        if (attachableComments.length > 0) {
            let trailingComments = Array.isArray(
                property._structTrailingComments
            )
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
        touchedComments.forEach(({ comment, snapshot }) =>
            restoreComment(comment, snapshot)
        );
        return null;
    }

    const nextStatement = statements[cursor];
    const nextBoundary = nextStatement
        ? Core.getNodeStartIndex(nextStatement)
        : Number.POSITIVE_INFINITY;

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
        touchedComments.forEach(({ comment, snapshot }) =>
            restoreComment(comment, snapshot)
        );
        return null;
    }

    if (!nextStatement && tracker.hasAfter(lastEnd)) {
        tracker.rollback();
        touchedComments.forEach(({ comment, snapshot }) =>
            restoreComment(comment, snapshot)
        );
        return null;
    }

    tracker.commit();

    const shouldForceBreak = properties.some(
        (property) => property?._hasTrailingInlineComment
    );

    return {
        properties,
        count: properties.length,
        shouldForceBreak
    };
}

export const consolidateStructAssignmentsTransform = createParserTransform<ConsolidateStructAssignmentsTransformOptions>(
    "consolidate-struct-assignments",
    {} as ConsolidateStructAssignmentsTransformOptions,
    (ast: MutableGameMakerAstNode, options: ConsolidateStructAssignmentsTransformOptions): MutableGameMakerAstNode => {
        if (!Core.isNode(ast)) {
            return ast;
        }
        const normalizedCommentTools = normalizeCommentTools(
            options.commentTools
        );
        const tracker = new CommentTracker(ast);
        const matcher = new StructAssignmentMatcher();
        const commentHandler = new AssignmentCommentHandler();
        
        visit(ast, tracker, normalizedCommentTools, matcher, commentHandler);

        tracker.removeConsumedComments();

        return ast;
    }
);
