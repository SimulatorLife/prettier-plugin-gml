import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

const {
    AST: {
        getNodeStartIndex,
        getNodeEndIndex,
        getNodeStartLine,
        getNodeEndLine,
        cloneLocation,
        getSingleVariableDeclarator,
        isNode,
        getSingleMemberIndexPropertyEntry,
        getCommentArray,
        isLineComment,
        forEachNodeChild
    },
    Utils: { asArray, isNonEmptyArray, stripStringQuotes }
} = Core;

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

export function consolidateStructAssignments(ast: any, commentTools?: any) {
    if (!isNode(ast)) {
        return ast;
    }

    const normalizedCommentTools = normalizeCommentTools(commentTools);
    const tracker = new CommentTracker(ast);
    visit(ast, tracker, normalizedCommentTools);
    tracker.removeConsumedComments();
    return ast;
}

function visit(node, tracker, commentTools) {
    if (!isNode(node)) {
        return;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            visit(item, tracker, commentTools);
        }
        return;
    }

    if (Array.isArray(node.body)) {
        consolidateBlock(node.body, tracker, commentTools);
        for (const child of node.body) {
            visit(child, tracker, commentTools);
        }
    } else if (isNode(node.body)) {
        visit(node.body, tracker, commentTools);
    }

    forEachNodeChild(node, (value, key) => {
        if (
            key === "body" ||
            key === "start" ||
            key === "end" ||
            key === "comments"
        ) {
            return;
        }
        visit(value, tracker, commentTools);
    });
}

function consolidateBlock(statements, tracker, commentTools) {
    if (!isNonEmptyArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index++) {
        const initializer = getStructInitializer(statements[index]);
        if (!initializer) {
            continue;
        }

        const { identifierName, structNode } = initializer;
        const structEndIndex = getNodeEndIndex(structNode);
        if (structEndIndex === undefined) {
            continue;
        }

        const initializerStart = getNodeStartIndex(statements[index]);
        const initializerEnd = getNodeEndIndex(statements[index]);
        if (tracker.hasBetween(initializerStart, initializerEnd)) {
            continue;
        }

        const collected = collectPropertyAssignments({
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
    commentTools
}) {
    const properties = [];
    let cursor = startIndex;
    let lastEnd = previousEnd;
    let previousStatement = null;
    let lastProperty = null;

    while (cursor < statements.length) {
        const statement = statements[cursor];
        const assignmentDetails = getStructPropertyAssignmentDetails(
            statement,
            identifierName
        );
        if (!assignmentDetails) {
            break;
        }

        const start = getNodeStartIndex(statement);
        const end = getNodeEndIndex(statement);
        if (start === undefined || end === undefined) {
            break;
        }

        if (
            !allowTrailingCommentsBetween({
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

        const property = buildPropertyFromAssignment(assignmentDetails);
        if (!property) {
            break;
        }

        const nextStatement = statements[cursor + 1];
        const nextStart = getNodeStartIndex(nextStatement);
        const attachableComments = tracker.takeBetween(
            end,
            nextStart ?? Number.POSITIVE_INFINITY,
            (comment) => isAttachableTrailingComment(comment, statement)
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
            const commentEnd = getNodeEndIndex(lastComment);
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
        return null;
    }

    const nextStatement = statements[cursor];
    const nextBoundary = nextStatement
        ? getNodeStartIndex(nextStatement)
        : Number.POSITIVE_INFINITY;

    if (
        !allowTrailingCommentsBetween({
            tracker,
            left: lastEnd,
            right: nextBoundary,
            precedingStatement: previousStatement,
            precedingProperty: lastProperty,
            commentTools
        })
    ) {
        return null;
    }

    if (!nextStatement && tracker.hasAfter(lastEnd)) {
        return null;
    }

    const shouldForceBreak = properties.some(
        (property) => property?._hasTrailingInlineComment
    );

    return {
        properties,
        count: properties.length,
        shouldForceBreak
    };
}

function getStructInitializer(statement) {
    if (!isNode(statement)) {
        return null;
    }

    if (statement.type === VARIABLE_DECLARATION) {
        const declarator = getSingleVariableDeclarator(statement);
        if (!isNode(declarator)) {
            return null;
        }

        if (!isNode(declarator.id) || declarator.id.type !== IDENTIFIER) {
            return null;
        }

        if (
            !isNode(declarator.init) ||
            declarator.init.type !== STRUCT_EXPRESSION
        ) {
            return null;
        }

        if (
            Array.isArray(declarator.init.properties) &&
            declarator.init.properties.length > 0
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

        if (!isNode(statement.left) || statement.left.type !== IDENTIFIER) {
            return null;
        }

        if (
            !isNode(statement.right) ||
            statement.right.type !== STRUCT_EXPRESSION
        ) {
            return null;
        }

        if (
            Array.isArray(statement.right.properties) &&
            statement.right.properties.length > 0
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

function isIdentifierRoot(node, identifierName) {
    return (
        isNode(node) && node.type === IDENTIFIER && node.name === identifierName
    );
}

function buildPropertyFromAssignment(
    assignmentDetails
): MutableGameMakerAstNode | null {
    if (!assignmentDetails) {
        return null;
    }

    const { assignment, propertyAccess } = assignmentDetails;
    if (!isNode(assignment) || assignment.type !== ASSIGNMENT_EXPRESSION) {
        return null;
    }

    if (!propertyAccess) {
        return null;
    }

    const propertyKey = getPropertyKeyInfo(propertyAccess.propertyNode);
    const propertyName = buildPropertyNameNode(propertyKey);
    if (!propertyName) {
        return null;
    }

    return {
        type: "Property",
        name: propertyName,
        value: assignment.right,
        start:
            cloneLocation(
                getPreferredLocation(
                    propertyAccess.propertyStart,
                    assignment.start
                )
            ) ?? null,
        end:
            cloneLocation(
                getPreferredLocation(assignment.right?.end, assignment.end)
            ) ?? null
    } as MutableGameMakerAstNode;
}

function getStructPropertyAssignmentDetails(statement, identifierName) {
    if (!isNode(statement) || statement.type !== ASSIGNMENT_EXPRESSION) {
        return null;
    }

    if (statement.operator !== "=") {
        return null;
    }

    const propertyAccess = getStructPropertyAccess(
        statement.left,
        identifierName
    );
    if (!propertyAccess) {
        return null;
    }

    return { assignment: statement, propertyAccess };
}

function getStructPropertyAccess(left, identifierName) {
    if (!isNode(left)) {
        return null;
    }

    if (!isIdentifierRoot(left.object, identifierName)) {
        return null;
    }

    if (left.type === MEMBER_DOT_EXPRESSION && isNode(left.property)) {
        return {
            propertyNode: left.property,
            propertyStart: left.property?.start
        };
    }

    if (left.type === MEMBER_INDEX_EXPRESSION) {
        const propertyNode = getSingleMemberIndexPropertyEntry(left);
        if (!isNode(propertyNode)) {
            return null;
        }

        return {
            propertyNode,
            propertyStart: propertyNode?.start
        };
    }

    return null;
}

function getPropertyKeyInfo(propertyNode) {
    if (!isNode(propertyNode)) {
        return null;
    }

    if (
        propertyNode.type === IDENTIFIER &&
        typeof propertyNode.name === "string"
    ) {
        return {
            identifierName: propertyNode.name,
            raw: propertyNode.name,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    if (
        propertyNode.type === LITERAL &&
        typeof propertyNode.value === "string"
    ) {
        const unquoted = stripStringQuotes(propertyNode.value);
        return {
            identifierName: unquoted,
            raw: propertyNode.value,
            start: propertyNode.start,
            end: propertyNode.end
        };
    }

    return null;
}

function buildPropertyNameNode(propertyKey) {
    if (!propertyKey) {
        return null;
    }

    const identifierName = propertyKey.identifierName;
    if (identifierName && isIdentifierSafe(identifierName)) {
        return {
            type: IDENTIFIER,
            name: identifierName,
            start: cloneLocation(propertyKey.start) ?? null,
            end: cloneLocation(propertyKey.end) ?? null
        };
    }

    if (typeof propertyKey.raw === "string") {
        return {
            type: LITERAL,
            value: propertyKey.raw,
            start: cloneLocation(propertyKey.start) ?? null,
            end: cloneLocation(propertyKey.end) ?? null
        };
    }

    return null;
}

function allowTrailingCommentsBetween({
    tracker,
    left,
    right,
    precedingStatement,
    precedingProperty,
    commentTools
}) {
    const commentEntries = tracker.getEntriesBetween(left, right);
    if (commentEntries.length === 0) {
        return true;
    }

    if (!precedingStatement) {
        return false;
    }

    const expectedLine = getNodeEndLine(precedingStatement);
    if (typeof expectedLine !== "number") {
        return false;
    }

    if (
        commentEntries.some(
            ({ comment }) => !isTrailingLineCommentOnLine(comment, expectedLine)
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
            // without registering it with Prettier's default trailing comment
            // machinery. The printer renders these comments directly to avoid
            // introducing additional line breaks while consolidating struct
            // assignments.
            comment.enclosingNode = commentTarget;
        }
    }

    if (commentTarget) {
        precedingProperty._hasTrailingInlineComment = true;
    }

    tracker.consumeEntries(commentEntries);
    return true;
}

function isTrailingLineCommentOnLine(comment, expectedLine) {
    if (!isLineComment(comment)) {
        return false;
    }

    return getNodeStartLine(comment) === expectedLine;
}

function getPreferredLocation(primary, fallback) {
    if (isNode(primary)) {
        return primary;
    }
    if (isNode(fallback)) {
        return fallback;
    }
    return null;
}

function isAttachableTrailingComment(comment, statement) {
    if (!isLineComment(comment)) {
        return false;
    }

    const commentStart = comment.start;
    if (!isNode(commentStart) || typeof commentStart.line !== "number") {
        return false;
    }

    const statementEndLine = getNodeEndLine(statement);
    if (typeof statementEndLine !== "number") {
        return false;
    }

    if (commentStart.line !== statementEndLine) {
        return false;
    }

    const commentStartIndex = getNodeStartIndex(comment);
    const statementEndIndex = getNodeEndIndex(statement);
    if (
        typeof commentStartIndex === "number" &&
        typeof statementEndIndex === "number" &&
        commentStartIndex <= statementEndIndex
    ) {
        return false;
    }

    return true;
}

const IDENTIFIER_SAFE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isIdentifierSafe(name) {
    return typeof name === "string" && IDENTIFIER_SAFE_PATTERN.test(name);
}

class CommentTracker {
    public comments: Array<unknown>;
    public entries: Array<{
        index: number;
        comment: unknown;
        consumed?: boolean;
    }>;

    constructor(ownerOrComments) {
        const sourceComments = (() => {
            // If the caller provided a raw array of comments, prefer that
            // directly. Some consumers construct tracker instances with
            // lightweight arrays in tests and transform helpers; using the
            // explicit array avoids ambiguous behaviour when the generic
            // `getCommentArray` helper is invoked with non-program shapes.
            if (Array.isArray(ownerOrComments)) {
                return ownerOrComments;
            }

            if (typeof getCommentArray === "function") {
                const normalized = getCommentArray(ownerOrComments);
                if (Array.isArray(normalized)) {
                    return normalized;
                }
            }

            if (!ownerOrComments || typeof ownerOrComments !== "object") {
                return [];
            }

            const { comments } = ownerOrComments;
            return asArray(comments);
        })();
        this.comments = sourceComments;
        this.entries = sourceComments
            .map((comment) => {
                // Prefer the canonical helper but fall back to direct shape
                // inspection when the helper cannot resolve the index. Some
                // test fixtures and early transform phases present bare
                // comment-like objects that still include a `start` index
                // but may not be recognized by the AST helper in all
                // import/resolve contexts. Be conservative and accept both
                // so the tracker remains resilient across consumers.
                // Prefer direct, simple shapes first (tests commonly provide
                // small comment-like objects). Fall back to the canonical
                // helper when the simple shape is not present so the tracker
                // remains tolerant across runtime import contexts.
                let index;
                const maybeStart = comment && comment.start;
                if (maybeStart && typeof maybeStart.index === "number") {
                    index = maybeStart.index;
                } else if (typeof maybeStart === "number") {
                    index = maybeStart;
                } else {
                    index = getNodeStartIndex(comment);
                }
                return { index, comment };
            })
            .filter((entry) => typeof entry.index === "number")
            .sort((a, b) => a.index - b.index);
    }

    hasBetween(left, right) {
        if (
            this.entries.length === 0 ||
            left === undefined ||
            right === undefined ||
            left >= right
        ) {
            return false;
        }
        let index = this.firstGreaterThan(left);
        while (index < this.entries.length) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                return false;
            }
            if (!entry.consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    hasAfter(position) {
        if (this.entries.length === 0 || position === undefined) {
            return false;
        }
        let index = this.firstGreaterThan(position);
        while (index < this.entries.length) {
            if (!this.entries[index].consumed) {
                return true;
            }
            index++;
        }
        return false;
    }

    takeBetween(left, right, predicate) {
        if (this.entries.length === 0 || left === undefined) {
            return [];
        }

        const upperBound =
            right === undefined ? Number.POSITIVE_INFINITY : right;
        if (left >= upperBound) {
            return [];
        }

        const results = [];
        const indicesToRemove = [];
        const startIndex = this.firstGreaterThan(left);

        for (let index = startIndex; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (entry.index >= upperBound) {
                break;
            }

            if (predicate && !predicate(entry.comment)) {
                continue;
            }

            results.push(entry.comment);
            indicesToRemove.push(index);
        }

        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
            this.entries.splice(indicesToRemove[i], 1);
        }

        return results;
    }

    firstGreaterThan(target) {
        let low = 0;
        let high = this.entries.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.entries[mid].index <= target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }

    getEntriesBetween(left, right) {
        if (
            this.entries.length === 0 ||
            left === undefined ||
            right === undefined ||
            left >= right
        ) {
            return [];
        }

        const startIndex = this.firstGreaterThan(left);
        const collected = [];

        for (let index = startIndex; index < this.entries.length; index++) {
            const entry = this.entries[index];
            if (entry.index >= right) {
                break;
            }
            if (!entry.consumed) {
                collected.push(entry);
            }
        }

        return collected;
    }

    consumeEntries(entries) {
        for (const entry of entries) {
                if (!entry) {
                // Defensive: skip nullish values.
                continue;
            }

            // Support two shapes: callers may pass the internal { index, comment }
            // entry objects (from getEntriesBetween) or raw comment nodes
            // (from takeBetween which returns comments). Handle both so tests
            // and callers behave consistently.
            if (entry && entry.comment) {
                // entry is { index, comment }
                entry.consumed = true;
                if (entry.comment) {
                    (entry.comment as any)._removedByConsolidation = true;
                }
            } else {
                // entry is a plain comment node
                const commentNode = entry;
                (commentNode as any)._removedByConsolidation = true;
                // Find the corresponding tracker entry and mark it consumed if present
                for (const e of this.entries) {
                    if (e && e.comment === commentNode) {
                        e.consumed = true;
                        break;
                    }
                }
            }
        }
    }

    removeConsumedComments() {
        if (this.comments.length === 0) {
            return;
        }

        let writeIndex = 0;
        for (let readIndex = 0; readIndex < this.comments.length; readIndex++) {
            const comment = this.comments[readIndex];
            if (comment && (comment as any)._removedByConsolidation) {
                continue;
            }
            this.comments[writeIndex] = comment;
            writeIndex++;
        }

        this.comments.length = writeIndex;
    }
}

// Expose the tracker for tests that assert on its behaviour. The class is
// intentionally not part of the public parser runtime API but tests rely on
// inspecting its behaviour directly; exporting here keeps the implementation
// local while satisfying the test-suite.
export { CommentTracker };
