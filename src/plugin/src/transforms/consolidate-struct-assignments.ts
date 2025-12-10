import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";
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

const STRUCT_EXPRESSION = "StructExpression";
const VARIABLE_DECLARATION = "VariableDeclaration";
const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";

const IDENTIFIER_SAFE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type AllowTrailingCommentsBetweenOptions = {
    tracker: CommentTracker;
    left: number | undefined;
    right: number | undefined;
    precedingStatement: MutableGameMakerAstNode | null;
    precedingProperty: MutableGameMakerAstNode | null;
    commentTools: CommentTools;
};

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

export class ConsolidateStructAssignmentsTransform extends FunctionalParserTransform<ConsolidateStructAssignmentsTransformOptions> {
    constructor() {
        super("consolidate-struct-assignments", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: ConsolidateStructAssignmentsTransformOptions
    ) {
        if (!Core.isNode(ast)) {
            return ast;
        }
        console.log("ConsolidateStructAssignmentsTransform executing");
        if (ast.comments) {
            console.log(
                `[DEBUG] Initial comments count: ${ast.comments.length}`
            );
        }

        const normalizedCommentTools = normalizeCommentTools(
            options.commentTools
        );
        const tracker = new CommentTracker(ast);
        this.visit(ast, tracker, normalizedCommentTools);

        const consumedCount = tracker.entries.filter((e) => e.consumed).length;
        console.log(`[DEBUG] Consumed comments count: ${consumedCount}`);
        if (consumedCount > 0) {
            console.log(
                "[DEBUG] Consumed comments:",
                tracker.entries
                    .filter((e) => e.consumed)
                    .map((e) => Core.getCommentValue(e.comment))
            );
        }

        tracker.removeConsumedComments();

        if (ast.comments) {
            console.log(`[DEBUG] Final comments count: ${ast.comments.length}`);
        }
        return ast;
    }

    private visit(node, tracker, commentTools) {
        if (!Core.isNode(node)) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                this.visit(item, tracker, commentTools);
            }
            return;
        }

        if (Array.isArray(node.body)) {
            this.consolidateBlock(node.body, tracker, commentTools);
            for (const child of node.body) {
                this.visit(child, tracker, commentTools);
            }
        } else if (Core.isNode(node.body)) {
            this.visit(node.body, tracker, commentTools);
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
            this.visit(value, tracker, commentTools);
        });
    }

    private consolidateBlock(statements, tracker, commentTools) {
        if (!Core.isNonEmptyArray(statements)) {
            return;
        }

        for (let index = 0; index < statements.length; index++) {
            const initializer = this.getStructInitializer(statements[index]);
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

            const collected = this.collectPropertyAssignments({
                statements,
                startIndex: index + 1,
                identifierName,
                previousEnd: structEndIndex,
                tracker,
                commentTools
            });

            if (!collected) {
                continue;
            }

            // The collected properties are assigned to the struct node; cast to
            // `MutableGameMakerAstNode` to allow mutation in-place with correct
            // typing for downstream transforms.
            (structNode as MutableGameMakerAstNode).properties =
                collected.properties;
            (structNode as MutableGameMakerAstNode).hasTrailingComma =
                collected.shouldForceBreak;

            statements.splice(index + 1, collected.count);
        }
    }

    private collectPropertyAssignments({
        statements,
        startIndex,
        identifierName,
        previousEnd,
        tracker,
        commentTools
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
            const assignmentDetails = this.getStructPropertyAssignmentDetails(
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
                !this.allowTrailingCommentsBetween({
                    tracker,
                    left: lastEnd,
                    right: start,
                    precedingStatement: previousStatement,
                    precedingProperty: lastProperty,
                    commentTools
                })
            ) {
                break;
            }

            if (tracker.hasBetween(start, end)) {
                break;
            }

            const property =
                this.buildPropertyFromAssignment(assignmentDetails);
            if (!property) {
                break;
            }

            const nextStatement = statements[cursor + 1];
            const nextStart = Core.getNodeStartIndex(nextStatement);
            const attachableComments = tracker.takeBetween(
                end,
                nextStart ?? Number.POSITIVE_INFINITY,
                (comment) =>
                    this.isAttachableTrailingComment(comment, statement)
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
            !this.allowTrailingCommentsBetween({
                tracker,
                left: lastEnd,
                right: nextBoundary,
                precedingStatement: previousStatement,
                precedingProperty: lastProperty,
                commentTools
            })
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

    private getStructInitializer(statement) {
        if (!Core.isNode(statement)) {
            return null;
        }

        if (statement.type === VARIABLE_DECLARATION) {
            const declarator = Core.getSingleVariableDeclarator(
                statement
            ) as MutableGameMakerAstNode | null;
            if (!Core.isNode(declarator)) {
                return null;
            }
            if (!Core.isIdentifierNode(declarator.id)) {
                return null;
            }

            if (Core.getNodeType(declarator.init) !== STRUCT_EXPRESSION) {
                return null;
            }

            if (Core.getNodeType(declarator.init) !== STRUCT_EXPRESSION) {
                return null;
            }

            if (
                Array.isArray((declarator.init as any).properties) &&
                (declarator.init as any).properties.length > 0
            ) {
                return null;
            }

            return {
                identifierName: declarator.id.name,
                structNode: declarator.init
            };
        }

        if (statement.type === ASSIGNMENT_EXPRESSION) {
            if (statement.operator !== "=") {
                return null;
            }

            if (!Core.isIdentifierNode(statement.left)) {
                return null;
            }

            if (Core.getNodeType(statement.right) !== STRUCT_EXPRESSION) {
                return null;
            }

            if (
                Array.isArray((statement.right as any).properties) &&
                (statement.right as any).properties.length > 0
            ) {
                return null;
            }

            return {
                identifierName: statement.left.name,
                structNode: statement.right
            };
        }

        return null;
    }

    private isIdentifierRoot(node, identifierName) {
        return Core.isIdentifierNode(node) && node.name === identifierName;
    }

    private buildPropertyFromAssignment(
        assignmentDetails
    ): MutableGameMakerAstNode | null {
        if (!assignmentDetails) {
            return null;
        }

        const { assignment, propertyAccess } = assignmentDetails;
        if (
            !Core.isNode(assignment) ||
            assignment.type !== ASSIGNMENT_EXPRESSION
        ) {
            return null;
        }
        const assignmentNode = assignment as MutableGameMakerAstNode;

        if (!propertyAccess) {
            return null;
        }

        const propertyKey = this.getPropertyKeyInfo(
            propertyAccess.propertyNode
        );
        const propertyName = this.buildPropertyNameNode(propertyKey);
        if (!propertyName) {
            return null;
        }

        return {
            type: "Property",
            name: propertyName,
            value: assignmentNode.right,
            start:
                Core.cloneLocation(
                    this.getPreferredLocation(
                        propertyAccess.propertyStart,
                        assignmentNode.start
                    )
                ) ?? null,
            end:
                Core.cloneLocation(
                    this.getPreferredLocation(
                        assignmentNode.right?.end,
                        assignmentNode.end
                    )
                ) ?? null
        } as unknown as MutableGameMakerAstNode;
    }

    private getStructPropertyAssignmentDetails(statement, identifierName) {
        if (
            !Core.isNode(statement) ||
            statement.type !== ASSIGNMENT_EXPRESSION
        ) {
            return null;
        }

        if (statement.operator !== "=") {
            return null;
        }

        const propertyAccess = this.getStructPropertyAccess(
            statement.left,
            identifierName
        );
        if (!propertyAccess) {
            return null;
        }

        return {
            assignment: statement as MutableGameMakerAstNode,
            propertyAccess
        };
    }

    private getStructPropertyAccess(left, identifierName) {
        if (!Core.isNode(left)) {
            return null;
        }

        if (!this.isIdentifierRoot(left.object, identifierName)) {
            return null;
        }

        if (left.type === MEMBER_DOT_EXPRESSION && Core.isNode(left.property)) {
            return {
                propertyNode: left.property,
                propertyStart: left.property?.start
            };
        }

        if (left.type === MEMBER_INDEX_EXPRESSION) {
            const propertyNode = Core.getSingleMemberIndexPropertyEntry(left);
            if (!Core.isNode(propertyNode)) {
                return null;
            }

            return {
                propertyNode,
                propertyStart: propertyNode?.start
            };
        }

        return null;
    }

    private getPropertyKeyInfo(propertyNode) {
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

    private buildPropertyNameNode(propertyKey) {
        if (!propertyKey) {
            return null;
        }

        const identifierName = propertyKey.identifierName;
        if (identifierName && this.isIdentifierSafe(identifierName)) {
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

    private allowTrailingCommentsBetween(
        options: AllowTrailingCommentsBetweenOptions
    ) {
        const {
            tracker,
            left,
            right,
            precedingStatement,
            precedingProperty,
            commentTools
        } = options;
        const commentEntries = tracker.getEntriesBetween(left, right);
        if (commentEntries.length === 0) {
            return true;
        }

        if (!precedingStatement) {
            return false;
        }

        const expectedLine = Core.getNodeEndLine(precedingStatement);
        if (typeof expectedLine !== "number") {
            return false;
        }

        if (
            commentEntries.some(
                ({ comment }) =>
                    !this.isTrailingLineCommentOnLine(comment, expectedLine)
            )
        ) {
            return false;
        }

        const commentTarget = precedingProperty
            ? (precedingProperty.value ?? precedingProperty)
            : null;
        for (const { comment } of commentEntries) {
            if (comment.leadingChar === ";") {
                comment.leadingChar = ",";
            }

            if (commentTarget) {
                // Preserve historical metadata so the comment remains discoverable
                // and mark it as a trailing comment so Prettier keeps it attached.
                comment.enclosingNode = commentTarget;
                commentTools.addTrailingComment(commentTarget, comment);
            }
        }

        if (commentTarget) {
            precedingProperty._hasTrailingInlineComment = true;
        }

        tracker.consumeEntries(commentEntries);
        return true;
    }

    private isTrailingLineCommentOnLine(comment, expectedLine) {
        if (!Core.isLineComment(comment)) {
            return false;
        }

        return Core.getNodeStartLine(comment) === expectedLine;
    }

    private getPreferredLocation(primary, fallback) {
        if (Core.isNode(primary)) {
            return primary;
        }
        if (Core.isNode(fallback)) {
            return fallback;
        }
        return null;
    }

    private isAttachableTrailingComment(comment, statement) {
        if (!Core.isLineComment(comment)) {
            return false;
        }

        const commentStart = comment.start;
        if (
            !Core.isObjectLike(commentStart) ||
            typeof commentStart.line !== "number"
        ) {
            return false;
        }

        const statementEndLine = Core.getNodeEndLine(statement);
        if (typeof statementEndLine !== "number") {
            return false;
        }

        if (commentStart.line !== statementEndLine) {
            return false;
        }

        const commentStartIndex = Core.getNodeStartIndex(comment);
        const statementEndIndex = Core.getNodeEndIndex(statement);
        if (
            typeof commentStartIndex === "number" &&
            typeof statementEndIndex === "number" &&
            commentStartIndex <= statementEndIndex
        ) {
            return false;
        }

        return true;
    }

    private isIdentifierSafe(name) {
        return typeof name === "string" && IDENTIFIER_SAFE_PATTERN.test(name);
    }
}

export const consolidateStructAssignmentsTransform =
    new ConsolidateStructAssignmentsTransform();
